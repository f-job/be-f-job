import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ReportStatus, ReportTargetType } from '../schemas/report.schema';

/**
 * Query parameters for the admin report queue read surface.
 * `GET /admin/reports?status=&targetType=&page=1&limit=20`
 *
 * The queue is returned newest-first and is optionally filterable by
 * `status` and `targetType` (Req 11.1). Pagination follows the shared
 * envelope convention: 1-indexed `page` (default 1) and `limit` defaulting
 * to 20 and capped at 100 (Req 11.1).
 */
export class ReportQueueDto {
  @ApiPropertyOptional({
    description: 'Filter the queue by the report review/enforcement status.',
    enum: ReportStatus,
    example: ReportStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({
    description: 'Filter the queue by the kind of reported entity (JOB or USER).',
    enum: ReportTargetType,
    example: ReportTargetType.JOB,
  })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;

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
    description: 'Number of reports per page (default 20, maximum 100).',
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
