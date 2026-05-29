import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload for PUT /payouts/my/settings
 *
 * All three fields are required so that the bank account record is always
 * complete before a payout request can be submitted.  Use PATCH semantics
 * on the front-end to pre-fill from the existing settings before submitting.
 */
export class UpdatePayoutSettingsDto {
  @ApiProperty({
    description: 'Name of the bank (e.g. "Vietcombank", "Techcombank").',
    example:     'Vietcombank',
    maxLength:   100,
  })
  @IsString()
  @IsNotEmpty({ message: 'bankName must not be empty.' })
  @MaxLength(100)
  bankName: string;

  @ApiProperty({
    description:
      'Bank account number. Stored as a string to preserve leading zeros.',
    example:  '0123456789',
    maxLength: 30,
  })
  @IsString()
  @IsNotEmpty({ message: 'accountNumber must not be empty.' })
  @MaxLength(30)
  accountNumber: string;

  @ApiProperty({
    description:
      'Account holder name exactly as it appears on the bank account.',
    example:  'NGUYEN VAN A',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'accountHolderName must not be empty.' })
  @MaxLength(100)
  accountHolderName: string;
}
