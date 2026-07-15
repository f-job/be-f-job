import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus } from './schemas/payment.schema';
import { PackagesService } from '../packages/packages.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    private readonly packagesService: PackagesService,
    private readonly configService: ConfigService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Create a new payment or reuse an existing PENDING payment.
   */
  async createPayment(userId: string, packageId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const packageObjectId = new Types.ObjectId(packageId);

    // Get the package details
    const pkg = await this.packagesService.findSinglePackage(packageId);

    const now = new Date();

    // Check for existing PENDING payment for this user & package that hasn't expired
    let payment = await this.paymentModel.findOne({
      userId: userObjectId,
      packageId: packageObjectId,
      status: PaymentStatus.PENDING,
      expiresAt: { $gt: now },
    });

    if (!payment) {
      // Create new payment
      const paymentCode = `PAY_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15); // Expire in 15 mins

      const amountToPay = pkg.price;
      
      payment = await this.paymentModel.create({
        userId: userObjectId,
        packageId: packageObjectId,
        paymentCode,
        packageName: pkg.name,
        creditsSnapshot: pkg.credits,
        amountSnapshot: amountToPay,
        expiresAt,
        status: PaymentStatus.PENDING,
      });

      this.logger.log(`Created new payment ${payment._id} (Code: ${paymentCode}) for user ${userId}`);
    } else {
      this.logger.log(`Reusing existing PENDING payment ${payment._id} for user ${userId}`);
    }

    // Generate VietQR URL dynamically
    const bankId = this.configService.get<string>('VIETQR_BANK_ID') || '970436'; // default VCB
    const accNo = this.configService.get<string>('VIETQR_ACCOUNT_NO') || '1111111111';
    const accName = this.configService.get<string>('VIETQR_ACCOUNT_NAME') || 'F JOB';

    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accNo}-compact2.jpg?amount=${payment.amountSnapshot}&addInfo=${payment.paymentCode}&accountName=${encodeURIComponent(accName)}`;

    return {
      id: payment._id,
      paymentCode: payment.paymentCode,
      amount: payment.amountSnapshot,
      packageName: payment.packageName,
      credits: payment.creditsSnapshot,
      status: payment.status,
      expiresAt: payment.expiresAt,
      qrUrl,
      bankId,
      accNo,
      accName,
    };
  }

  async getPayment(paymentId: string, userId: string) {
    const payment = await this.paymentModel.findOne({
      _id: new Types.ObjectId(paymentId),
      userId: new Types.ObjectId(userId),
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Check expiration if still pending
    if (payment.status === PaymentStatus.PENDING && payment.expiresAt < new Date()) {
      payment.status = PaymentStatus.EXPIRED;
      await payment.save();
    }

    return payment;
  }

  /**
   * Process webhook from payment gateway (Casso / SePay / Generic)
   * Expected payload: { transactionId, amount, transferContent }
   */
  async processWebhook(payload: { transactionId: string; amount: number; transferContent: string }) {
    const { transactionId, amount, transferContent } = payload;
    
    // Extract paymentCode from transferContent
    const match = transferContent.match(/(PAY_[A-Z0-9]+)/);
    if (!match) {
      this.logger.warn(`No payment code found in transfer content: ${transferContent}`);
      return { success: false, message: 'No payment code found' };
    }

    const paymentCode = match[1];

    const payment = await this.paymentModel.findOne({ paymentCode });
    if (!payment) {
      this.logger.warn(`Payment not found for code: ${paymentCode}`);
      return { success: false, message: 'Payment not found' };
    }

    // Idempotency: Ignore if already processed
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(`Payment ${paymentCode} already processed successfully.`);
      return { success: true, message: 'Already processed' };
    }

    // Check if expired
    if (payment.status === PaymentStatus.EXPIRED || (payment.status === PaymentStatus.PENDING && payment.expiresAt < new Date())) {
      this.logger.warn(`Payment ${paymentCode} is expired.`);
      payment.status = PaymentStatus.EXPIRED;
      await payment.save();
      return { success: false, message: 'Payment expired' };
    }

    // Validate amount
    if (amount < payment.amountSnapshot) {
      this.logger.warn(`Insufficient amount for ${paymentCode}. Expected: ${payment.amountSnapshot}, Received: ${amount}`);
      return { success: false, message: 'Insufficient amount' };
    }

    // Execute in a single ACID transaction
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Update Payment
      payment.status = PaymentStatus.SUCCESS;
      payment.paidAt = new Date();
      payment.transactionId = transactionId;
      await payment.save({ session });

      // 2. Grant Credits
      await this.packagesService.grantCreditsAfterPayment(
        payment.userId.toString(),
        payment.packageId.toString(),
        payment._id.toString(),
        session,
      );

      await session.commitTransaction();
      this.logger.log(`Payment ${paymentCode} processed successfully. Credits granted.`);
      return { success: true, message: 'Payment processed successfully' };
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Error processing payment ${paymentCode}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Expire old pending payments. Can be called by a cron job.
   */
  async cleanupExpiredPayments() {
    const result = await this.paymentModel.updateMany(
      {
        status: PaymentStatus.PENDING,
        expiresAt: { $lt: new Date() },
      },
      {
        $set: { status: PaymentStatus.EXPIRED },
      }
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} pending payments.`);
    }
  }
}
