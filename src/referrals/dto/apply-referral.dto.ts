import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * Payload for POST /referrals/apply
 *
 * Accepts the referral code shared by another user.
 * Validation rules:
 *   - Must be a non-empty string.
 *   - Length between 1 and 20 characters (generous upper bound to support various formats).
 *   - Must be uppercase alphanumeric with an optional single hyphen (e.g. "FJOB-A1B2C3D4").
 */
export class ApplyReferralDto {
  @ApiProperty({
    description:
      'The unique referral code of the user who invited you. ' +
      'Must be uppercase alphanumeric, optionally separated by a single hyphen ' +
      '(e.g. "FJOB-A1B2C3D4").',
    example: 'FJOB-A1B2C3D4',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  @Matches(/^[A-Z0-9]+(-[A-Z0-9]+)?$/, {
    message: 'referralCode must be uppercase alphanumeric with an optional hyphen separator.',
  })
  referralCode: string;
}
