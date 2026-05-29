import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types }   from 'mongoose';
import { User, UserDocument }                   from '../users/schemas/user.schema';
import { Payout, PayoutDocument, PayoutStatus } from './schemas/payout.schema';
import {
  PayoutSettings,
  PayoutSettingsDocument,
} from './schemas/payout-settings.schema';
import { RequestPayoutDto, MIN_PAYOUT_AMOUNT } from './dto/request-payout.dto';
import { UpdatePayoutSettingsDto }              from './dto/update-payout-settings.dto';
import { QueryPayoutsDto }                      from './dto/query-payouts.dto';
import { DevSimulatePayoutDto }                 from './dto/dev-simulate-payout.dto';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(Payout.name)
    private readonly payoutModel: Model<PayoutDocument>,

    @InjectModel(PayoutSettings.name)
    private readonly settingsModel: Model<PayoutSettingsDocument>,
  ) {}

  // ─── POST /payouts/request ─────────────────────────────────────────────────

  /**
   * Creates a new payout/withdrawal request for the authenticated user.
   *
   * Pre-conditions (both enforced here):
   *   ERR_4014 — Bank settings must be configured before requesting a payout.
   *   ERR_3010 — Amount must be >= MIN_PAYOUT_AMOUNT (DTO enforces this too,
   *              but we double-check here at the service layer for safety).
   *
   * The bankInfo is snapshotted from the current PayoutSettings document at
   * request time so historical records remain accurate if settings change later.
   *
   * @param userId   Authenticated user ID.
   * @param dto      Validated DTO with the requested withdrawal amount.
   */
  async requestPayout(
    userId: string,
    dto:    RequestPayoutDto,
  ): Promise<PayoutDocument> {
    // ── Verify bank settings are configured ────────────────────────────────
    const settings = await this.settingsModel.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!settings) {
      throw new BadRequestException({
        errorCode: 'ERR_4014',
        message:
          'Bank payout settings have not been configured. ' +
          'Please set up your bank account via PUT /payouts/my/settings first.',
      });
    }

    // ── Service-level amount guard (belt-and-suspenders) ───────────────────
    if (dto.amount < MIN_PAYOUT_AMOUNT) {
      throw new BadRequestException({
        errorCode: 'ERR_3010',
        message:   `Requested amount must be at least ${MIN_PAYOUT_AMOUNT} VND.`,
      });
    }

    // ── Create payout with bank info snapshot ──────────────────────────────
    const [payout] = await this.payoutModel.create([
      {
        userId:   new Types.ObjectId(userId),
        amount:   dto.amount,
        bankInfo: {
          bankName:          settings.bankName,
          accountNumber:     settings.accountNumber,
          accountHolderName: settings.accountHolderName,
        },
        status: PayoutStatus.PENDING,
      },
    ]);

    this.logger.log(
      `Payout requested: userId=${userId} amount=${dto.amount} payoutId=${payout._id}`,
    );

    return payout;
  }

  // ─── GET /payouts/my ──────────────────────────────────────────────────────

  /**
   * Returns a paginated, newest-first list of all payout requests for the
   * authenticated user.
   *
   * @param userId   Authenticated user ID.
   * @param dto      Pagination parameters.
   */
  async getMyPayouts(userId: string, dto: QueryPayoutsDto) {
    const userObjectId = new Types.ObjectId(userId);
    const page         = dto.page  ?? 1;
    const limit        = dto.limit ?? 10;
    const skip         = (page - 1) * limit;

    const filter = { userId: userObjectId };

    const [data, total] = await Promise.all([
      this.payoutModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.payoutModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── GET /payouts/my/:id ───────────────────────────────────────────────────

  /**
   * Returns full details of a single payout request.
   *
   * Guards:
   *   ERR_4013 — Payout document not found.
   *   ERR_2010 — The authenticated user does not own this payout.
   *
   * @param userId    Authenticated user ID.
   * @param payoutId  MongoDB ObjectId string of the target payout.
   */
  async getPayoutById(
    userId:   string,
    payoutId: string,
  ): Promise<PayoutDocument> {
    const payout = await this.payoutModel
      .findById(new Types.ObjectId(payoutId))
      .lean();

    if (!payout) {
      throw new NotFoundException({
        errorCode: 'ERR_4013',
        message:   `Payout with ID "${payoutId}" was not found.`,
      });
    }

    if (payout.userId.toString() !== userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2010',
        message:   'You do not have permission to view this payout record.',
      });
    }

    return payout as unknown as PayoutDocument;
  }

  // ─── GET /payouts/my/settings ──────────────────────────────────────────────

  /**
   * Returns the caller's current bank payout settings.
   * Returns null (with a descriptive message) if not yet configured.
   *
   * @param userId   Authenticated user ID.
   */
  async getPayoutSettings(userId: string): Promise<PayoutSettingsDocument | null> {
    const settings = await this.settingsModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();

    return settings as PayoutSettingsDocument | null;
  }

  // ─── PUT /payouts/my/settings ──────────────────────────────────────────────

  /**
   * Creates or fully replaces the caller's bank account settings.
   * Uses `upsert: true` so no seed step or initial POST is required —
   * the document is created on the first PUT call.
   *
   * @param userId   Authenticated user ID.
   * @param dto      Validated DTO with the complete bank account details.
   */
  async upsertPayoutSettings(
    userId: string,
    dto:    UpdatePayoutSettingsDto,
  ): Promise<PayoutSettingsDocument> {
    const updated = await this.settingsModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        {
          $set: {
            bankName:          dto.bankName,
            accountNumber:     dto.accountNumber,
            accountHolderName: dto.accountHolderName,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean();

    return updated as PayoutSettingsDocument;
  }

  // ─── GET /payouts/my/settings/validate ────────────────────────────────────

  /**
   * Pre-flight validation check that confirms whether the user is eligible
   * to submit a payout request.
   *
   * Returns a structured eligibility report covering:
   *   - Whether bank settings are configured.
   *   - Whether the referral balance meets the minimum payout threshold.
   *   - The current referral balance.
   *   - A human-readable reason if ineligible.
   *
   * This endpoint is READ-ONLY and does not modify any state.
   *
   * @param userId   Authenticated user ID.
   */
  async validatePayoutEligibility(userId: string): Promise<{
    eligible:        boolean;
    reason?:         string;
    referralBalance: number;
    minimumAmount:   number;
    hasSettings:     boolean;
  }> {
    const userObjectId = new Types.ObjectId(userId);

    const [settings, user] = await Promise.all([
      this.settingsModel.findOne({ userId: userObjectId }).select('_id').lean(),
      this.userModel.findById(userObjectId).select('referralBalance').lean(),
    ]);

    const hasSettings     = Boolean(settings);
    const referralBalance = user?.referralBalance ?? 0;
    const balanceSufficient = referralBalance >= MIN_PAYOUT_AMOUNT;

    if (!hasSettings) {
      return {
        eligible:        false,
        reason:          'Bank settings have not been configured. Please update your payout settings first.',
        referralBalance,
        minimumAmount:   MIN_PAYOUT_AMOUNT,
        hasSettings,
      };
    }

    if (!balanceSufficient) {
      return {
        eligible:        false,
        reason:          `Your referral balance (${referralBalance} VND) is below the minimum payout threshold (${MIN_PAYOUT_AMOUNT} VND).`,
        referralBalance,
        minimumAmount:   MIN_PAYOUT_AMOUNT,
        hasSettings,
      };
    }

    return {
      eligible:        true,
      referralBalance,
      minimumAmount:   MIN_PAYOUT_AMOUNT,
      hasSettings,
    };
  }

  // ─── DEV HELPER: Simulate payout status ───────────────────────────────────

  /**
   * ⚠️  DEVELOPER / QA BACK-DOOR — NOT FOR PRODUCTION USE ⚠️
   *
   * Force-transitions a payout document to any target status without going
   * through the admin approval flow.  This method exists exclusively to
   * support Postman-based integration testing while the Admin Panel
   * (Module 12) is not yet implemented.
   *
   * Usage:
   *   Call via PATCH /payouts/dev/simulate/:id  (controller route).
   *   Set `status` to any PayoutStatus value in the request body.
   *
   * Side-effects:
   *   - Sets `processedAt` to now when transitioning to COMPLETED or REJECTED.
   *   - Accepts an optional `adminNote` carried in the DTO's `note` property
   *     (not currently in the DTO, but can be extended trivially).
   *
   * @param payoutId   MongoDB ObjectId string of the target payout.
   * @param dto        DTO containing the target `status`.
   */
  async _devSimulatePayoutStatus(
    payoutId: string,
    dto:      DevSimulatePayoutDto,
  ): Promise<PayoutDocument> {
    const payout = await this.payoutModel.findById(
      new Types.ObjectId(payoutId),
    );

    if (!payout) {
      throw new NotFoundException({
        errorCode: 'ERR_4013',
        message:   `Payout with ID "${payoutId}" was not found.`,
      });
    }

    const isTerminalStatus =
      dto.status === PayoutStatus.COMPLETED ||
      dto.status === PayoutStatus.REJECTED;

    payout.status = dto.status;

    if (isTerminalStatus) {
      payout.processedAt = new Date();
    }

    await payout.save();

    this.logger.warn(
      `[DEV] Payout status simulated: payoutId=${payoutId} ` +
      `oldStatus=${payout.status} newStatus=${dto.status}`,
    );

    return payout;
  }
}
