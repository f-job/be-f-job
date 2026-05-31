import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload for PATCH /admin/reviews/:id/hide — "Hide a visible review".
 *
 * The moderating admin must supply a reason of at most 1,000 characters
 * (Req 3.7). A missing/empty reason or one exceeding 1,000 characters is
 * rejected by the global `ValidationPipe` (ERR_3001) and the review's
 * visibility is left unchanged.
 */
export class HideReviewDto {
  @ApiProperty({
    description: 'Reason for hiding the review (required, max 1,000 characters).',
    maxLength: 1000,
    example: 'Abusive language in violation of community guidelines.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
