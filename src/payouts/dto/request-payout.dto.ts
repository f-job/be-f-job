import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

/** Minimum payout amount enforced by platform business rules (in VND). */
export const MIN_PAYOUT_AMOUNT = 50_000;

/**
 * Payload for POST /payouts/request
 *
 * Validation rules:
 *   - `amount` must be a number >= MIN_PAYOUT_AMOUNT (50,000 VND).
 *     Fractional values are technically allowed by the validator but
 *     the service will store the raw value — the UI should round to integers.
 */
export class RequestPayoutDto {
  @ApiProperty({
    description:
      `Requested withdrawal amount in VND. ` +
      `Minimum allowed value is ${MIN_PAYOUT_AMOUNT.toLocaleString()} VND.`,
    example:  200_000,
    minimum:  MIN_PAYOUT_AMOUNT,
  })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_PAYOUT_AMOUNT, {
    message: `amount must be at least ${MIN_PAYOUT_AMOUNT} VND (ERR_3010).`,
  })
  amount: number;
}
