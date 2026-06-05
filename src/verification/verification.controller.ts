import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { VerificationService } from './verification.service';
import { VerifyIdentityDto } from './dto/verify-identity.dto';
import { VerificationStatusDto } from './dto/verification-status.dto';

@ApiTags('Verification')
@Controller('verification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Verify user identity with CCCD/CMND data',
    description: `
      Submit extracted CCCD/CMND data for identity verification.
      
      **Important:**
      - No images are stored on server
      - Only verified information is saved (encrypted)
      - User must give consent before verification
      - Can only verify once per account
      
      **Process:**
      1. Client extracts data from CCCD (QR or OCR)
      2. Client sends extracted data to this endpoint
      3. Server validates and stores minimal verified info
      4. User account is marked as "verified"
    `,
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Identity verified successfully',
    type: VerificationStatusDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid data or already verified' })
  async verifyIdentity(
    @Req() req: any,
    @Body() dto: VerifyIdentityDto,
  ): Promise<VerificationStatusDto> {
    const userId = req.user.sub;
    
    if (!userId) {
      throw new BadRequestException('User ID not found in request. Please login again.');
    }
    
    return this.verificationService.verifyIdentity(userId, dto);
  }

  @Get('status')
  @ApiOperation({ 
    summary: 'Get verification status',
    description: 'Get current verification status for the authenticated user',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Verification status retrieved',
    type: VerificationStatusDto,
  })
  async getStatus(@Req() req: any): Promise<VerificationStatusDto> {
    const userId = req.user.sub;
    
    if (!userId) {
      throw new BadRequestException('User ID not found in request. Please login again.');
    }
    
    return this.verificationService.getVerificationStatus(userId);
  }

  @Delete('remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Remove verification (for testing or user request)',
    description: 'Remove verification data from user account. Use with caution.',
  })
  @ApiResponse({ status: 200, description: 'Verification removed' })
  async removeVerification(@Req() req: any): Promise<{ message: string }> {
    const userId = req.user.sub;
    
    if (!userId) {
      throw new BadRequestException('User ID not found in request. Please login again.');
    }
    
    return this.verificationService.removeVerification(userId);
  }
}
