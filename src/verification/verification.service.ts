import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '@/users/schemas/user.schema';
import { VerifyIdentityDto } from './dto/verify-identity.dto';
import { VerificationStatusDto } from './dto/verification-status.dto';
import * as crypto from 'crypto';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly encryptionKey: string;

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
  ) {
    // Use environment variable for encryption key
    this.encryptionKey = process.env.IDENTITY_ENCRYPTION_KEY || 'default-key-change-in-production';
    
    if (this.encryptionKey === 'default-key-change-in-production') {
      this.logger.warn('⚠️  Using default encryption key. Set IDENTITY_ENCRYPTION_KEY in production!');
    }
  }

  /**
   * Encrypt sensitive data (ID number)
   */
  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt sensitive data (for verification purposes only)
   */
  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Mask ID number for display (show first 3 and last 3 digits)
   */
  private maskIdNumber(idNumber: string): string {
    if (idNumber.length <= 6) return '***';
    
    const firstThree = idNumber.slice(0, 3);
    const lastThree = idNumber.slice(-3);
    const masked = '*'.repeat(idNumber.length - 6);
    
    return `${firstThree}${masked}${lastThree}`;
  }

  /**
   * Verify user identity with extracted CCCD data
   * NOTE: No images are stored, only processed data
   * 
   * NEW: Check for duplicate CCCD to ensure 1 CCCD = 1 account
   */
  async verifyIdentity(userId: string, dto: VerifyIdentityDto): Promise<VerificationStatusDto> {
    this.logger.log(`Verifying identity for user ${userId}`);

    // Find user
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if already verified
    if (user.identityVerification?.isVerified) {
      this.logger.warn(`User ${userId} is already verified`);
      throw new BadRequestException('User is already verified');
    }

    // Validate ID number format (basic validation)
    if (!/^\d{9,12}$/.test(dto.idNumber)) {
      throw new BadRequestException('Invalid ID number format');
    }

    // Encrypt ID number before checking for duplicates
    const encryptedIdNumber = this.encrypt(dto.idNumber);

    // ═══ CHECK FOR DUPLICATE CCCD ═══
    // Find if this CCCD is already used by another user
    const existingUser = await this.userModel.findOne({
      'identityVerification.idNumber': encryptedIdNumber,
      _id: { $ne: userId }, // Exclude current user
    });

    if (existingUser) {
      this.logger.warn(
        `CCCD number already used by another account. User ${userId} attempted to use CCCD that belongs to user ${existingUser._id}`,
      );
      throw new BadRequestException(
        'Số CCCD/CMND này đã được sử dụng cho tài khoản khác. Mỗi CCCD chỉ có thể đăng ký 1 tài khoản.',
      );
    }

    // Update user with verification data
    user.identityVerification = {
      isVerified: true,
      verifiedAt: new Date(),
      fullName: dto.fullName.trim(),
      idNumber: encryptedIdNumber,
      dateOfBirth: new Date(dto.dateOfBirth),
      verificationMethod: dto.verificationMethod,
    };

    // Mark identity verification as completed
    user.identityVerificationRequired = false;

    await user.save();

    this.logger.log(`✅ User ${userId} verified successfully via ${dto.verificationMethod}`);

    return this.getVerificationStatus(userId);
  }

  /**
   * Get verification status for a user
   */
  async getVerificationStatus(userId: string): Promise<VerificationStatusDto> {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.identityVerification || !user.identityVerification.isVerified) {
      return { isVerified: false };
    }

    const { identityVerification } = user;

    // Decrypt ID number only to mask it for display
    let maskedId: string | undefined;
    if (identityVerification.idNumber) {
      try {
        const decryptedId = this.decrypt(identityVerification.idNumber);
        maskedId = this.maskIdNumber(decryptedId);
      } catch (error) {
        this.logger.error('Failed to decrypt ID number', error);
      }
    }

    return {
      isVerified: true,
      verifiedAt: identityVerification.verifiedAt,
      fullName: identityVerification.fullName,
      idNumberMasked: maskedId,
      dateOfBirth: identityVerification.dateOfBirth,
      verificationMethod: identityVerification.verificationMethod,
    };
  }

  /**
   * Remove verification (for testing or user request)
   */
  async removeVerification(userId: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new BadRequestException('User not found');
    }

    user.identityVerification = null;
    await user.save();

    this.logger.log(`Verification removed for user ${userId}`);

    return { message: 'Verification removed successfully' };
  }
}
