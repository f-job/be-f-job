import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for the public reviewee review list.
 * `GET /reviews?revieweeId=&page=1&limit=10`
 *
 * Returns a reviewee's currently-visible reviews newest-first, paginated with
 * a 1-indexed `page` (default 1) and `limit` defaulting to 10 and capped at 100
 * (Req 2.1). Per Req 2.8 a `page` below 1 or a `limit` above 100 is rejected by
 * the global `ValidationPipe` (ERR_3001) and no list is returned — the
 * `@Min`/`@Max` validators below enforce those bounds.
 */
export class ReviewQueryDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the reviewee (User._id) whose reviews to list.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsMongoId()
  revieweeId: string;

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
    description: 'Number of reviews per page (default 10, maximum 100).',
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
