import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsEnum,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExperienceLevel, CasualJobType } from '../../jobs/schemas/job.schema';

export class SearchJobsQueryDto {
  // ─── Full-text / Keyword ─────────────────────────────────────────────────────

  /**
   * Full-text keyword matched against title and companyName using MongoDB $text index.
   * Falls back to $regex on title | companyName when no compound text index hit exists.
   */
  @ApiPropertyOptional({
    description:
      'Keyword search across job title and company name. ' +
      'Uses the MongoDB full-text index (title, companyName). ' +
      'Falls back to case-insensitive regex on partial matches.',
    example: 'phục vụ bàn',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  // ─── Company ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter by employer company name (case-insensitive, partial match)',
    example: 'Highlands Coffee',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  // ─── Location ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Province / city filter — matched against the job `location` field ' +
      '(case-insensitive, partial regex). Aligns with /locations/provinces master data.',
    example: 'Hồ Chí Minh',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({
    description: 'District / ward filter (case-insensitive, partial match)',
    example: 'Quận 1',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  // ─── Industry ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Industry / sector filter (case-insensitive, partial match). ' +
      'Aligns with /industries master data (e.g. "F&B", "Sự kiện", "Giao hàng").',
    example: 'F&B',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  // ─── Job Classification ──────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Experience requirement for the casual role.',
    enum: ExperienceLevel,
    example: ExperienceLevel.NONE,
  })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  level?: ExperienceLevel;

  @ApiPropertyOptional({
    description: 'Type of casual engagement. Aligns with /job-types master data.',
    enum: CasualJobType,
    example: CasualJobType.GIG_EVENT,
  })
  @IsOptional()
  @IsEnum(CasualJobType)
  jobType?: CasualJobType;

  // ─── Salary ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Minimum casual wage (VND). Returns jobs where salaryAmount >= salary_min.',
    example: 20000,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  salary_min?: number;

  @ApiPropertyOptional({
    description:
      'Maximum casual wage (VND). Returns jobs where salaryAmount <= salary_max.',
    example: 500000,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  salary_max?: number;

  // ─── Urgency ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter urgent / hot gigs only (true = urgent jobs only).',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true'  || value === true  || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  })
  @IsBoolean()
  is_urgent?: boolean;

  // ─── Sort ────────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Sort order: "newest" (default) = most recently posted first; ' +
      '"salary_high" = highest casual rate first; "salary_low" = lowest first.',
    enum: ['newest', 'salary_high', 'salary_low'],
    default: 'newest',
    example: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'salary_high', 'salary_low'])
  sort?: 'newest' | 'salary_high' | 'salary_low' = 'newest';

  // ─── Pagination ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Page number (1-indexed)', example: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
