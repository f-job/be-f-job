import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload for PATCH /admin/verifications/:userId/reject — "Reject a candidate's
 * verification".
 *
 * The rejecting admin must supply a reason of at most 1,000 characters
 * (Req 8.7). A missing/empty reason or one exceeding 1,000 characters is
 * rejected by the global `ValidationPipe` (ERR_3001) and the candidate's
 * `VerificationStatus` is left unchanged. `VerificationService.reject` repeats
 * this check defensively.
 */
export class RejectVerificationDto {
  @ApiProperty({
    description:
      'Reason for rejecting the verification (required, max 1,000 characters).',
    maxLength: 1000,
    example: 'The uploaded CCCD image is blurry and unreadable.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
