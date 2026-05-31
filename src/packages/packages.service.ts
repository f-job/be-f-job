import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Package, PackageDocument } from './schemas/package.schema';
import { EmployerCredit, EmployerCreditDocument } from './schemas/employer-credit.schema';
import { CreditTransaction, CreditTransactionDocument, CreditTransactionType } from './schemas/credit-transaction.schema';
import { EmployerProfile, EmployerStatus } from '../employers/schemas/employer-profile.schema';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@Injectable()
export class PackagesService {
  constructor(
    @InjectModel(Package.name)
    private readonly packageModel: Model<PackageDocument>,

    @InjectModel(EmployerCredit.name)
    private readonly employerCreditModel: Model<EmployerCreditDocument>,

    @InjectModel(CreditTransaction.name)
    private readonly creditTransactionModel: Model<CreditTransactionDocument>,

    @InjectModel(EmployerProfile.name)
    private readonly employerProfileModel: Model<EmployerProfile>,

    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ADMIN OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Admin creates a new service package.
   */
  async createPackage(dto: CreatePackageDto): Promise<PackageDocument> {
    return this.packageModel.create(dto);
  }

  /**
   * Admin updates an existing package.
   */
  async updatePackage(id: string, dto: UpdatePackageDto): Promise<PackageDocument> {
    const updated = await this.packageModel.findByIdAndUpdate(id, dto, { new: true });
    if (!updated) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Package with ID "${id}" was not found.`,
      });
    }
    return updated;
  }

  /**
   * Admin soft-deletes a package by setting isActive = false.
   */
  async deletePackage(id: string): Promise<PackageDocument> {
    const deleted = await this.packageModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    );
    if (!deleted) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Package with ID "${id}" was not found.`,
      });
    }
    return deleted;
  }

  /**
   * Retrieve all packages (both active and inactive) for admin CRUD view.
   */
  async findAllPackagesForAdmin(): Promise<PackageDocument[]> {
    return this.packageModel.find().sort({ createdAt: -1 });
  }

  /**
   * Admin global monitoring of all credit ledger flows.
   */
  async getAllCreditsFlows(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.creditTransactionModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email fullName')
        .lean(),
      this.creditTransactionModel.countDocuments(),
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

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PUBLIC & EMPLOYER OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Public list of active packages for Employers to view.
   */
  async findActivePackages(): Promise<PackageDocument[]> {
    return this.packageModel.find({ isActive: true }).sort({ price: 1 });
  }

  /**
   * Single package specifications lookup.
   */
  async findSinglePackage(id: string): Promise<PackageDocument> {
    const pkg = await this.packageModel.findOne({ _id: id, isActive: true });
    if (!pkg) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Package with ID "${id}" was not found or is inactive.`,
      });
    }
    return pkg;
  }

  /**
   * Retrieve currently active purchased service packages/subscriptions of the caller.
   */
  async findMyPurchasedPackages(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const creditRecord = await this.employerCreditModel.findOne({ userId: userObjectId });
    if (!creditRecord) {
      return [];
    }

    const now = new Date();
    // Return only packages that are marked active and have not expired
    return creditRecord.purchasedPackages.filter(
      (pkg) => pkg.isActive && pkg.expiresAt > now,
    );
  }

  /**
   * Retrieve historical invoice log tracking package purchases.
   */
  async findMyInvoiceHistory(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    return this.creditTransactionModel
      .find({
        userId: userObjectId,
        type: CreditTransactionType.PURCHASE,
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Retrieve current authenticated Employer's numerical credit currency balance.
   */
  async getCreditBalance(userId: string): Promise<{ balance: number }> {
    const userObjectId = new Types.ObjectId(userId);
    const creditRecord = await this.employerCreditModel.findOne({ userId: userObjectId });
    if (!creditRecord) {
      // Fallback: If no Credit Record exists yet, check legacy EmployerProfile.credit
      const employerProfile = await this.employerProfileModel.findOne({ userId: userObjectId });
      return { balance: employerProfile ? employerProfile.credit : 0 };
    }
    return { balance: creditRecord.balance };
  }

  /**
   * Retrieve paginated history ledger log of credit events for this Employer.
   */
  async findMyTransactions(userId: string, dto: ListTransactionsDto) {
    const userObjectId = new Types.ObjectId(userId);
    const skip = (dto.page - 1) * dto.limit;
    
    const filter: Record<string, any> = { userId: userObjectId };
    if (dto.type) {
      filter.type = dto.type;
    }

    const [data, total] = await Promise.all([
      this.creditTransactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(dto.limit)
        .lean(),
      this.creditTransactionModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: {
        total,
        page: dto.page,
        limit: dto.limit,
        totalPages: Math.ceil(total / dto.limit),
      },
    };
  }

  /**
   * Purchase a package with full ACID Transaction isolation.
   */
  async purchasePackage(userId: string, packageId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const packageObjectId = new Types.ObjectId(packageId);

    // 1. Check if the target package exists and is active
    const pkg = await this.packageModel.findOne({ _id: packageObjectId, isActive: true });
    if (!pkg) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Package with ID "${packageId}" was not found or is inactive.`,
      });
    }

    // 2. Fetch the corresponding EmployerProfile and ensure it is APPROVED
    const employer = await this.employerProfileModel.findOne({ userId: userObjectId });
    if (!employer) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Employer profile not found.',
      });
    }

    if (employer.status !== EmployerStatus.APPROVED) {
      throw new ForbiddenException({
        errorCode: 'ERR_2002',
        message: 'Your Employer account is pending approval or blocked. Operation denied.',
      });
    }

    // 3. Initiate MongoDB session for ACID transactions
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 4. Update the employer credit balance using atomic $inc query operator
      // We use upsert = true in case the employer doesn't have an employer_credits record yet.
      const updatedCredit = await this.employerCreditModel.findOneAndUpdate(
        { userId: userObjectId },
        {
          $inc: { balance: pkg.credits },
          $set: { employerId: employer._id },
        },
        { new: true, upsert: true, session },
      );

      // 5. Append the package to purchasedPackages list
      const durationDays = 30; // standard package duration 30 days
      const purchasedAt = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(purchasedAt.getDate() + durationDays);

      await this.employerCreditModel.updateOne(
        { userId: userObjectId },
        {
          $push: {
            purchasedPackages: {
              packageId: pkg._id,
              name: pkg.name,
              purchasedAt,
              expiresAt,
              isActive: true,
            },
          },
        },
        { session },
      );

      // 6. Sync legacy EmployerProfile.credit atomically to maintain global database consistency
      await this.employerProfileModel.updateOne(
        { userId: userObjectId },
        { $inc: { credit: pkg.credits } },
        { session },
      );

      // 7. Insert the immutable audit ledger log record inside MongoDB
      const transactionRecord = await this.creditTransactionModel.create(
        [
          {
            userId: userObjectId,
            type: CreditTransactionType.PURCHASE,
            amount: pkg.credits,
            balanceAfter: updatedCredit.balance,
            packageId: pkg._id,
            packageName: pkg.name,
            price: pkg.price,
            description: `Purchased service package "${pkg.name}" for ${pkg.price} VND`,
          },
        ],
        { session },
      );

      // Commit transaction
      await session.commitTransaction();
      
      return {
        transactionId: transactionRecord[0]._id,
        packageName: pkg.name,
        creditsCredited: pkg.credits,
        newBalance: updatedCredit.balance,
      };
    } catch (error) {
      // Rollback transaction on failure
      await session.abortTransaction();
      throw error;
    } finally {
      // Release session
      await session.endSession();
    }
  }

  /**
   * Helper engine to deduct credits atomically for other features (e.g. Job Boost, Profile CV unlock)
   */
  async deductCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType,
    referenceId?: string,
    description?: string,
  ) {
    const userObjectId = new Types.ObjectId(userId);

    const employer = await this.employerProfileModel.findOne({ userId: userObjectId });
    if (!employer) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Employer profile not found.',
      });
    }

    if (employer.status !== EmployerStatus.APPROVED) {
      throw new ForbiddenException({
        errorCode: 'ERR_2002',
        message: 'Your Employer account is not approved yet.',
      });
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Get current credit balance
      const credit = await this.employerCreditModel.findOne({ userId: userObjectId }).session(session);
      const currentBalance = credit ? credit.balance : 0;

      if (currentBalance < amount) {
        throw new BadRequestException({
          errorCode: 'ERR_2003',
          message: 'Insufficient credit balance to perform this operation.',
        });
      }

      // 2. Atomically update the balance utilizing Mongoose's $inc operator
      const updatedCredit = await this.employerCreditModel.findOneAndUpdate(
        { userId: userObjectId },
        { $inc: { balance: -amount } },
        { new: true, session },
      );

      // 3. Keep legacy employerProfile.credit field in sync atomically
      await this.employerProfileModel.updateOne(
        { userId: userObjectId },
        { $inc: { credit: -amount } },
        { session },
      );

      // 4. Create immutable transaction log
      const refObjectId = referenceId ? new Types.ObjectId(referenceId) : undefined;
      const transactionRecord = await this.creditTransactionModel.create(
        [
          {
            userId: userObjectId,
            type,
            amount: -amount,
            balanceAfter: updatedCredit.balance,
            referenceId: refObjectId,
            description: description || `Spent ${amount} credits on ${type}`,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      return {
        success: true,
        balance: updatedCredit.balance,
        transactionId: transactionRecord[0]._id,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
