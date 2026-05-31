import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { AuditAction } from '../schemas/audit-log.schema';

/**
 * Query parameters for the paginated, filterable audit-log read surface.
 * `GET /admin/audit-logs?actorId=&action=&targetId=&page=1&limit=20`
 *
 * The trail is append-only (Req 15.3): this DTO drives a read-only `query`
 * with optional filters on `actorId`, `action`, and `targetId` (Req 15.4),
 * returned newest-first and paginated (Req 15.1, 15.2).
 */
export class AuditQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by the acting user (User._id) that performed the action.',
    example: '665f1c2e9a1b2c3d4e5f6a7b',
  })
  @IsOptional()
  @IsMongoId()
  actorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by the trust-and-safety action that was performed.',
    enum: AuditAction,
    example: AuditAction.REVIEW_HIDDEN,
  })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({
    description: 'Filter by the affected entity id (Review/User/Report/Application _id).',
    example: '665f1c2e9a1b2c3d4e5f6a7b',
  })
  @IsOptional()
  @IsMongoId()
  targetId?: string;

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
    description: 'Number of audit records per page.',
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
