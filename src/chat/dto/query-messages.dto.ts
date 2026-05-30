import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query parameters for GET /conversations/:id/messages.
 *
 * Messages are returned newest-first (createdAt: -1) — the caller can
 * implement "load older messages" UI by incrementing the page number.
 *
 * Defaults: page = 1, limit = 20.
 */
export class QueryMessagesDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed). Defaults to 1.',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer.' })
  @Min(1, { message: 'page must be at least 1.' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of messages per page. Defaults to 20. Maximum 100.',
    example: 20,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer.' })
  @Min(1, { message: 'limit must be at least 1.' })
  limit?: number = 20;
}
