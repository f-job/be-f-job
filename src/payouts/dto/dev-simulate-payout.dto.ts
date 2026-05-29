import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PayoutStatus } from '../schemas/payout.schema';

/**
 * Payload for the DEV-ONLY back-door route:
 *   PATCH /payouts/dev/simulate/:id
 *
 * Allows test engineers to transition a payout to any status without
 * going through the admin panel.  This DTO is intentionally not restricted
 * to specific transitions so QA can test all state combinations freely.
 *
 * ⚠️  Remove or guard this route before deploying to production.
 */
export class DevSimulatePayoutDto {
  @ApiProperty({
    description: 'Target status to force-set on the payout document.',
    enum:        PayoutStatus,
    example:     PayoutStatus.COMPLETED,
  })
  @IsEnum(PayoutStatus, {
    message: `status must be one of: ${Object.values(PayoutStatus).join(', ')}.`,
  })
  status: PayoutStatus;
}
