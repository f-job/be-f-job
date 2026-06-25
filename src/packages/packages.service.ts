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
import { CreditConfig, CreditConfigDocument } from './schemas/credit-config.schema';
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

    @InjectModel(CreditConfig.name)
    private readonly creditConfigModel: Model<CreditConfigDocument>,

    @InjectModel(EmployerProfile.name)
    private readonly employerProfileModel: Model<EmployerProfile>,

    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // 1. CONFIG OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  async getCreditConfig(): Promise<CreditConfig> {
    let config = await this.creditConfigModel.findOne({ type: 'default' });
    if (!config) {
      config = await this.creditConfigModel.create({ type: 'default' });
    }
    return config;
  }

  async updateCreditConfig(dto: Partial<CreditConfig>): Promise<CreditConfig> {
    const updated = await this.creditConfigModel.findOneAndUpdate(
      { type: 'default' },
      { $set: dto },
      { new: true, upsert: true }
    );
    return updated;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. ADMIN OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  async createPackage(dto: CreatePackageDto): Promise<PackageDocument> {
    return this.packageModel.create(dto);
  }

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

  async findAllPackagesForAdmin(): Promise<PackageDocument[]> {
    return this.packageModel.find().sort({ createdAt: -1 });
  }

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
  // 3. LAZY EVALUATION (CLEANUP EXPIRING PACKAGES)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Lazily checks for expired packages and updates the balance if any points have expired.
   */
  private async evaluateExpiredCredits(userId: Types.ObjectId): Promise<EmployerCreditDocument | null> {
    const creditRecord = await this.employerCreditModel.findOne({ userId });
    if (!creditRecord) return null;

    const now = new Date();
    let isModified = false;
    let expiredPoints = 0;

    for (const pkg of creditRecord.purchasedPackages) {
      if (pkg.remainingCredits > 0 && pkg.expiresAt < now) {
        expiredPoints += pkg.remainingCredits;
        pkg.remainingCredits = 0; // Clear out remaining
        pkg.isActive = false;     // Mark expired
        isModified = true;
      }
    }

    if (isModified) {
      // Recompute total balance
      const newBalance = creditRecord.purchasedPackages.reduce((acc, curr) => acc + curr.remainingCredits, 0);
      creditRecord.balance = newBalance;
      
      // We must sync the legacy profile if we deduct expired points
      if (expiredPoints > 0) {
        await this.employerProfileModel.updateOne(
          { userId },
          { $inc: { credit: -expiredPoints } }
        );
        // Log the expiration event
        await this.creditTransactionModel.create({
          userId,
          type: CreditTransactionType.ADMIN_ADJUST,
          amount: -expiredPoints,
          balanceAfter: newBalance,
          description: `Automatically removed ${expiredPoints} expired points via Lazy Cleanup.`,
        });
      }
      
      await creditRecord.save();
    }
    
    return creditRecord;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // 4. PUBLIC & EMPLOYER OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  async findActivePackages(): Promise<PackageDocument[]> {
    return this.packageModel.find({ isActive: true }).sort({ price: 1 });
  }

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

  async findMyPurchasedPackages(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    await this.evaluateExpiredCredits(userObjectId); // Run lazy cleanup

    const creditRecord = await this.employerCreditModel.findOne({ userId: userObjectId });
    if (!creditRecord) {
      return [];
    }

    const now = new Date();
    // Return only packages that have remaining credits and have not expired
    return creditRecord.purchasedPackages.filter(
      (pkg) => pkg.remainingCredits > 0 && pkg.expiresAt > now,
    );
  }

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

  async getCreditBalance(userId: string): Promise<{ balance: number }> {
    const userObjectId = new Types.ObjectId(userId);
    await this.evaluateExpiredCredits(userObjectId); // Run lazy cleanup

    const creditRecord = await this.employerCreditModel.findOne({ userId: userObjectId });
    if (!creditRecord) {
      const employerProfile = await this.employerProfileModel.findOne({ userId: userObjectId });
      return { balance: employerProfile ? employerProfile.credit : 0 };
    }
    return { balance: creditRecord.balance };
  }

  /**
   * Comprehensive detail view of balance (total, available, expiring soon)
   */
  async getDetailedBalance(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const creditRecord = await this.evaluateExpiredCredits(userObjectId);
    
    if (!creditRecord) {
      return {
        total: 0,
        available: 0,
        expiringPoints: 0,
        expiringAt: null
      };
    }

    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);

    let total = creditRecord.balance;
    let expiringPoints = 0;
    let expiringAt = null;

    for (const pkg of creditRecord.purchasedPackages) {
      if (pkg.remainingCredits > 0 && pkg.expiresAt > now && pkg.expiresAt <= threeDaysFromNow) {
        expiringPoints += pkg.remainingCredits;
        if (!expiringAt || pkg.expiresAt < expiringAt) {
          expiringAt = pkg.expiresAt;
        }
      }
    }

    return {
      total,
      available: total,
      expiringPoints,
      expiringAt
    };
  }

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

    const pkg = await this.packageModel.findOne({ _id: packageObjectId, isActive: true });
    if (!pkg) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Package with ID "${packageId}" was not found or is inactive.`,
      });
    }

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

    // Lazy Evaluate before purchasing to ensure accurate balance
    await this.evaluateExpiredCredits(userObjectId);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const durationDays = pkg.durationDays || 30; 
      const purchasedAt = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(purchasedAt.getDate() + durationDays);

      let creditRecord = await this.employerCreditModel.findOne({ userId: userObjectId }).session(session);
      if (!creditRecord) {
        creditRecord = new this.employerCreditModel({
          userId: userObjectId,
          employerId: employer._id,
          balance: 0,
          purchasedPackages: []
        });
      }

      creditRecord.purchasedPackages.push({
        packageId: pkg._id as any,
        name: pkg.name,
        purchasedAt,
        expiresAt,
        originalCredits: pkg.credits,
        remainingCredits: pkg.credits,
        isActive: true,
      });

      creditRecord.balance += pkg.credits;
      const updatedBalance = creditRecord.balance;
      await creditRecord.save({ session });

      await this.employerProfileModel.updateOne(
        { userId: userObjectId },
        { $inc: { credit: pkg.credits } },
        { session },
      );

      const transactionRecord = await this.creditTransactionModel.create(
        [
          {
            userId: userObjectId,
            type: CreditTransactionType.PURCHASE,
            amount: pkg.credits,
            balanceAfter: updatedBalance,
            packageId: pkg._id,
            packageName: pkg.name,
            price: pkg.price,
            description: `Purchased service package "${pkg.name}" for ${pkg.price} VND`,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      
      return {
        transactionId: transactionRecord[0]._id,
        packageName: pkg.name,
        creditsCredited: pkg.credits,
        newBalance: updatedBalance,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * FIFO Credit Deduction Engine
   */
  async deductCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType,
    referenceId?: string,
    description?: string,
  ) {
    if (amount === 0) return { success: true, balance: undefined }; // Free

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

    // Always run lazy cleanup before deduction to ensure we only spend valid points
    await this.evaluateExpiredCredits(userObjectId);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const creditRecord = await this.employerCreditModel.findOne({ userId: userObjectId }).session(session);
      if (!creditRecord) {
        throw new BadRequestException({
          errorCode: 'ERR_2003',
          message: 'Insufficient credit balance.',
        });
      }

      if (creditRecord.balance < amount) {
        throw new BadRequestException({
          errorCode: 'ERR_2003',
          message: 'Insufficient credit balance to perform this operation.',
        });
      }

      // Sort packages by expiresAt ASC to apply FIFO
      const now = new Date();
      let packages = creditRecord.purchasedPackages.filter(p => p.remainingCredits > 0 && p.expiresAt > now);
      packages.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

      let amountLeftToDeduct = amount;
      
      for (const pkg of packages) {
        if (amountLeftToDeduct <= 0) break;

        if (pkg.remainingCredits >= amountLeftToDeduct) {
          pkg.remainingCredits -= amountLeftToDeduct;
          amountLeftToDeduct = 0;
        } else {
          amountLeftToDeduct -= pkg.remainingCredits;
          pkg.remainingCredits = 0;
        }
      }

      // Recompute global balance
      const updatedBalance = creditRecord.purchasedPackages.reduce((sum, pkg) => sum + pkg.remainingCredits, 0);
      creditRecord.balance = updatedBalance;
      await creditRecord.save({ session });

      await this.employerProfileModel.updateOne(
        { userId: userObjectId },
        { $inc: { credit: -amount } },
        { session },
      );

      const refObjectId = referenceId ? new Types.ObjectId(referenceId) : undefined;
      const transactionRecord = await this.creditTransactionModel.create(
        [
          {
            userId: userObjectId,
            type,
            amount: -amount,
            balanceAfter: updatedBalance,
            referenceId: refObjectId,
            description: description || `Spent ${amount} credits on ${type}`,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      return {
        success: true,
        balance: updatedBalance,
        transactionId: transactionRecord[0]._id,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async hasUnlockedRecently(userId: string, candidateId: string): Promise<boolean> {
    const userObjectId = new Types.ObjectId(userId);
    const candidateObjectId = new Types.ObjectId(candidateId);
    
    // Check if there is a PROFILE_UNLOCK transaction for this candidate within the last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const tx = await this.creditTransactionModel.findOne({
      userId: userObjectId,
      type: CreditTransactionType.PROFILE_UNLOCK,
      referenceId: candidateObjectId,
      createdAt: { $gte: fourteenDaysAgo }
    });

    return !!tx;
  }
}
