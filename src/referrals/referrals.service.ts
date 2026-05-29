import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { User, UserDocument }         from '../users/schemas/user.schema';
import { Referral, ReferralDocument } from './schemas/referral.schema';
import { ApplyReferralDto }           from './dto/apply-referral.dto';
import { QueryReferralHistoryDto }    from './dto/query-referral-history.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Business rule constants
// ─────────────────────────────────────────────────────────────────────────────

/** Amount (VND) credited to the referrer's wallet per successful referral. */
const REFERRAL_REWARD_AMOUNT = 50_000;

/** Prefix prepended to every generated referral code, e.g. "FJOB-A1B2C3D4". */
const CODE_PREFIX = 'FJOB';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,

    @InjectConnection()
    private readonly connection: Connection,

    private readonly configService: ConfigService,
  ) {}

  // ─── POST /referrals/apply ─────────────────────────────────────────────────

  /**
   * Applies a referral code to the calling user's account.
   *
   * Guards:
   *   ERR_4012 — Self-referral: caller is attempting to use their own code.
   *   ERR_4011 — The caller already has a referral applied (referredBy is set).
   *   ERR_4010 — The supplied code does not match any user.
   *
   * Atomicity:
   *   Uses a Mongoose session / transaction so both the User.referredBy update
   *   and the Referral log insert succeed or fail together.  The referrer's
   *   referralBalance increment is included in the same session.
   *
   * @param callerId   MongoDB ObjectId string of the authenticated user.
   * @param dto        Validated DTO carrying the referral code.
   */
  async applyReferralCode(
    callerId: string,
    dto:      ApplyReferralDto,
  ): Promise<{ message: string; rewardAmount: number }> {
    // ── Load caller document ────────────────────────────────────────────────
    const caller = await this.userModel
      .findById(callerId)
      .select('referralCode referredBy');

    if (!caller) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   'Authenticated user record not found.',
      });
    }

    // ── Guard: cannot use own code ──────────────────────────────────────────
    if (
      caller.referralCode &&
      caller.referralCode.toUpperCase() === dto.referralCode.toUpperCase()
    ) {
      throw new ForbiddenException({
        errorCode: 'ERR_4012',
        message:   'You cannot apply your own referral code.',
      });
    }

    // ── Guard: already referred ─────────────────────────────────────────────
    if (caller.referredBy) {
      throw new ConflictException({
        errorCode: 'ERR_4011',
        message:   'You have already applied a referral code.',
      });
    }

    // ── Resolve the referrer ────────────────────────────────────────────────
    const referrer = await this.userModel
      .findOne({ referralCode: dto.referralCode.toUpperCase() })
      .select('_id');

    if (!referrer) {
      throw new NotFoundException({
        errorCode: 'ERR_4010',
        message:   `Referral code "${dto.referralCode}" was not found.`,
      });
    }

    // ── Transactional write ─────────────────────────────────────────────────
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      // 1. Mark the caller as referred and link back to the referrer.
      await this.userModel.updateOne(
        { _id: new Types.ObjectId(callerId) },
        { $set: { referredBy: referrer._id } },
        { session },
      );

      // 2. Increment the referrer's wallet balance atomically.
      await this.userModel.updateOne(
        { _id: referrer._id },
        { $inc: { referralBalance: REFERRAL_REWARD_AMOUNT } },
        { session },
      );

      // 3. Create a permanent referral log entry.
      await this.referralModel.create(
        [
          {
            referrerId:   referrer._id,
            refereeId:    new Types.ObjectId(callerId),
            rewardAmount: REFERRAL_REWARD_AMOUNT,
          },
        ],
        { session },
      );

      await session.commitTransaction();

      this.logger.log(
        `Referral applied: refereeId=${callerId} referrerId=${referrer._id} ` +
        `reward=${REFERRAL_REWARD_AMOUNT}`,
      );

      return {
        message:      'Referral code applied successfully. Your referrer has been rewarded.',
        rewardAmount: REFERRAL_REWARD_AMOUNT,
      };
    } catch (error : any) {
      await session.abortTransaction();
      this.logger.error(`applyReferralCode transaction failed: ${error.message}`);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // ─── GET /referrals/my ─────────────────────────────────────────────────────

  /**
   * Returns the caller's referral code (generating it lazily if not yet set),
   * a shareable invite URL, and an aggregated campaign summary.
   *
   * Lazy code generation: if the user does not have a referralCode, we create
   * one now and persist it.  This handles existing users created before the
   * referral system was introduced without requiring a migration script.
   *
   * @param userId   MongoDB ObjectId string of the authenticated user.
   */
  async getMyReferralInfo(userId: string): Promise<{
    referralCode:  string;
    inviteUrl:     string;
    totalReferrals: number;
    totalEarned:   number;
  }> {
    let user = await this.userModel
      .findById(userId)
      .select('referralCode referralBalance');

    if (!user) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   'User not found.',
      });
    }

    // ── Lazy code generation ────────────────────────────────────────────────
    if (!user.referralCode) {
      const code = this._generateReferralCode();

      await this.userModel.updateOne(
        { _id: new Types.ObjectId(userId) },
        { $set: { referralCode: code } },
      );

      user.referralCode = code;
    }

    // ── Campaign summary ────────────────────────────────────────────────────
    const totalReferrals = await this.referralModel.countDocuments({
      referrerId: new Types.ObjectId(userId),
    });

    // ── Invite URL construction ─────────────────────────────────────────────
    const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL', 'https://f-job.app');
    const inviteUrl   = `${frontendUrl}/register?ref=${user.referralCode}`;

    return {
      referralCode:   user.referralCode,
      inviteUrl,
      totalReferrals,
      totalEarned:    user.referralBalance ?? 0,
    };
  }

  // ─── GET /referrals/history ────────────────────────────────────────────────

  /**
   * Returns a paginated, newest-first log of all successful outgoing referrals
   * where the caller was the referrer.
   *
   * @param userId   Authenticated user ID.
   * @param dto      Pagination parameters.
   */
  async getReferralHistory(userId: string, dto: QueryReferralHistoryDto) {
    const referrerObjectId = new Types.ObjectId(userId);
    const page             = dto.page  ?? 1;
    const limit            = dto.limit ?? 10;
    const skip             = (page - 1) * limit;

    const filter = { referrerId: referrerObjectId };

    const [data, total] = await Promise.all([
      this.referralModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('refereeId', 'fullName email')
        .lean(),
      this.referralModel.countDocuments(filter),
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

  // ─── GET /referrals/balance ────────────────────────────────────────────────

  /**
   * Returns the caller's current referral wallet balance.
   *
   * @param userId   Authenticated user ID.
   */
  async getReferralBalance(userId: string): Promise<{ referralBalance: number }> {
    const user = await this.userModel
      .findById(userId)
      .select('referralBalance');

    if (!user) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   'User not found.',
      });
    }

    return { referralBalance: user.referralBalance ?? 0 };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Generates a unique referral code in the format "FJOB-XXXXXXXX" where
   * X is an uppercase alphanumeric character.
   *
   * Uses Math.random() for simplicity — collision probability is negligible
   * given the 36^8 ≈ 2.8 trillion possible combinations and the sparse index
   * on the `referralCode` field will catch the rare duplicate on write.
   */
  private _generateReferralCode(): string {
    const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const length = 8;
    let   suffix = '';

    for (let i = 0; i < length; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `${CODE_PREFIX}-${suffix}`;
  }
}
