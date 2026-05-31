import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for the admin verification queue.
 * `GET /admin/verifications?page=1&limit=20`
 *
 * Returns candidates whose `VerificationStatus` is `PENDING_REVIEW`, oldest-first
 * (the order they entered the queue), paginated at no more than 100 candidates
 * per page (Req 8.1). Pagination follows the shared envelope convention used by
 * the audit and review queues: 1-indexed `page` (default 1) and `limit`
 * defaulting to 20 and capped at 100. A page below 1 or a limit above 100 is
 * rejected by the global `ValidationPipe` (ERR_3001).
 */
export class VerificationQueueDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed).',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of candidates per page (default 20, maximum 100).',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
