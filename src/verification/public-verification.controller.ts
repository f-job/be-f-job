import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { VerifyIdentityDto } from './dto/verify-identity.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '@/users/schemas/user.schema';

/**
 * PUBLIC verification endpoint for post-registration identity verification.
 * This allows users to verify their identity immediately after registration
 * without needing to login first.
 */
@ApiTags('Public Verification')
@Controller('verification/public')
export class PublicVerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  @Post('verify-with-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Verify identity with email (public endpoint for post-registration)',
    description: `
      **PUBLIC ENDPOINT** - No authentication required.
      
      This endpoint allows users to verify their identity immediately after 
      registration, before their first login.
      
      **Process:**
      1. User registers account
      2. User is prompted to verify identity
      3. User scans CCCD and submits with email
      4. System verifies identity and marks account as verified
      5. User can now login
      
      **Security:**
      - Checks that email exists and needs verification
      - Prevents duplicate CCCD usage (1 CCCD = 1 account)
      - Requires valid CCCD QR data
      - No authentication needed (used during onboarding)
      
      **Important:**
      - This is ONLY for users who just registered
      - After verification, user MUST use regular login
      - Each CCCD can only be used once
    `,
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Identity verified successfully. User can now login.',
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid data, user not found, already verified, or CCCD already used',
  })
  async verifyWithEmail(
    @Body() dto: VerifyIdentityDto & { email: string },
  ) {
    // Find user by email
    const user = await this.userModel.findOne({ 
      email: dto.email.toLowerCase() 
    });

    if (!user) {
      throw new BadRequestException('Email không tồn tại trong hệ thống');
    }

    // Check if already verified
    if (user.identityVerification?.isVerified) {
      throw new BadRequestException('Tài khoản này đã được xác thực');
    }

    // Check if verification is still required
    if (!user.identityVerificationRequired) {
      throw new BadRequestException('Tài khoản này không yêu cầu xác thực');
    }

    // Use the verification service to verify
    return this.verificationService.verifyIdentity(user._id.toString(), dto);
  }
}
