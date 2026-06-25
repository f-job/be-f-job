import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';

export enum VerificationMethod {
  CCCD_QR = 'cccd_qr',
  CCCD_OCR = 'cccd_ocr',
  MANUAL = 'manual',
}

export class VerifyIdentityDto {
  @ApiProperty({ 
    description: 'Full name from CCCD',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  fullName: string;

  @ApiProperty({ 
    description: 'CCCD/CMND number (will be encrypted)',
    example: '001234567890',
  })
  @IsString()
  idNumber: string;

  @ApiProperty({ 
    description: 'Date of birth from CCCD',
    example: '1990-01-15',
  })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ 
    description: 'Verification method used',
    enum: VerificationMethod,
    example: VerificationMethod.CCCD_QR,
  })
  @IsEnum(VerificationMethod)
  verificationMethod: VerificationMethod;

  @ApiProperty({ 
    description: 'User consent to privacy policy',
    example: true,
  })
  @IsOptional()
  consentGiven?: boolean;
}
