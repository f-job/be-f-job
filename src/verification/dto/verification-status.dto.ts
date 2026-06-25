import { ApiProperty } from '@nestjs/swagger';

export class VerificationStatusDto {
  @ApiProperty({ 
    description: 'Whether the user is verified',
    example: true,
  })
  isVerified: boolean;

  @ApiProperty({ 
    description: 'When the verification was completed',
    example: '2025-01-15T10:30:00Z',
    required: false,
  })
  verifiedAt?: Date;

  @ApiProperty({ 
    description: 'Verified full name',
    example: 'Nguyễn Văn A',
    required: false,
  })
  fullName?: string;

  @ApiProperty({ 
    description: 'Masked ID number',
    example: '001******890',
    required: false,
  })
  idNumberMasked?: string;

  @ApiProperty({ 
    description: 'Date of birth',
    example: '1990-01-15',
    required: false,
  })
  dateOfBirth?: Date;

  @ApiProperty({ 
    description: 'Verification method used',
    example: 'cccd_qr',
    required: false,
  })
  verificationMethod?: string;
}
