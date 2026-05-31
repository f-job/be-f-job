import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for the admin review moderation list.
 * `GET /admin/reviews?revieweeId=&hidden=&page=1&limit=20`
 *
 * Unlike the public list, this surface includes hidden reviews so admins can
 * moderate them (Req 3.1 read surface). It is optionally filterable by
 * `revieweeId` and visibility (`hidden`), and is returned newest-first.
 * Pagination follows the shared envelope convention: 1-indexed `page`
 * (default 1) and `limit` defaulting to 20 and capped at 100.
 */
export class AdminReviewQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by the reviewee (User._id) whose reviews to list.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsOptional()
  @IsMongoId()
  revieweeId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by moderation visibility — `true` returns only hidden reviews, ' +
      '`false` only visible reviews. Omit to return both.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  })
  @IsBoolean()
  hidden?: boolean;

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
    description: 'Number of reviews per page (default 20, maximum 100).',
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
