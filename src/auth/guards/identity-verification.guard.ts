import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '@/users/schemas/user.schema';

/**
 * Guard that checks if the authenticated user has completed identity verification.
 * 
 * **Usage**: Apply to routes that require verified identity (e.g., apply for jobs, send messages, create reports)
 * 
 * **Requirements**:
 * - User must be authenticated (use with @UseGuards(JwtAuthGuard, IdentityVerificationGuard))
 * - User must have completed identity verification (identityVerificationRequired = false)
 * 
 * **Throws**: ForbiddenException (403) with ERR_2004 if user hasn't completed verification
 * 
 * @example
 * ```typescript
 * @Post('apply')
 * @UseGuards(JwtAuthGuard, IdentityVerificationGuard)
 * applyForJob(@Body() dto: ApplyDto) {
 *   // Only verified users can reach here
 * }
 * ```
 */
@Injectable()
export class IdentityVerificationGuard implements CanActivate {
  private readonly logger = new Logger(IdentityVerificationGuard.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      // Should not happen if JwtAuthGuard is applied first
      throw new ForbiddenException({
        errorCode: 'ERR_1001',
        message: 'Authentication required',
      });
    }

    const userId = user.sub;

    // Fetch user from database to check verification status
    const userDoc = await this.userModel.findById(userId).lean();

    if (!userDoc) {
      throw new ForbiddenException({
        errorCode: 'ERR_4001',
        message: 'User not found',
      });
    }

    // Only CANDIDATE role requires identity verification
    // ADMIN and EMPLOYER can perform actions without verification
    if (userDoc.role !== 'CANDIDATE') {
      return true; // Allow non-candidates to proceed
    }

    // Check if CANDIDATE needs to complete identity verification
    if (userDoc.identityVerificationRequired || !userDoc.identityVerification?.isVerified) {
      this.logger.warn(
        `Candidate ${userId} attempted to perform action without completing identity verification`,
      );

      throw new ForbiddenException({
        errorCode: 'ERR_2004',
        message: 'Bạn cần hoàn tất xác thực danh tính trước khi thực hiện thao tác này. Vui lòng xác thực CCCD của bạn.',
      });
    }

    // Candidate is verified, allow access
    return true;
  }
}
