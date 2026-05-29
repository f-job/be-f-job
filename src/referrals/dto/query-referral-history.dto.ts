import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for the paginated referral history endpoint.
 * GET /referrals/history?page=1&limit=10
 */
export class QueryReferralHistoryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example:     1,
    default:     1,
    minimum:     1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of records per page',
    example:     10,
    default:     10,
    minimum:     1,
    maximum:     100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
