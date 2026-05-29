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
import { ExperienceLevel, CasualJobType } from '../schemas/job.schema';

export class ListJobsQueryDto {
  // ─── Full-text search ───────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Full-text keyword search across job title, description, and company name',
    example: 'phục vụ bàn',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  // ─── Location filters ────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Province / city filter (case-insensitive, partial match)',
    example: 'Hồ Chí Minh',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({
    description: 'District / ward filter (case-insensitive, partial match)',
    example: 'Quận 1',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  // ─── Salary filters ──────────────────────────────────────────────────────────
  // Casual jobs store a single flat salaryAmount (not a min/max band).
  // These params filter against that scalar using $gte / $lte operators in the service.

  @ApiPropertyOptional({
    description:
      'Minimum casual wage filter (VND). ' +
      'Returns jobs where salaryAmount >= salary_min. ' +
      'Interpreted in the unit described by the job\'s salaryType (hourly / daily / fixed).',
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
      'Maximum casual wage filter (VND). ' +
      'Returns jobs where salaryAmount <= salary_max.',
    example: 500000,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  salary_max?: number;

  // ─── Categorical filters ─────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Experience requirement filter for the casual role',
    enum: ExperienceLevel,
    example: ExperienceLevel.NONE,
  })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  level?: ExperienceLevel;

  @ApiPropertyOptional({
    description: 'Type of casual engagement',
    enum: CasualJobType,
    example: CasualJobType.GIG_EVENT,
  })
  @IsOptional()
  @IsEnum(CasualJobType)
  job_type?: CasualJobType;

  @ApiPropertyOptional({
    description: 'Industry / sector filter (case-insensitive, partial match)',
    example: 'F&B',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({
    description: 'Filter urgent / hot gigs only (true = urgent jobs only)',
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

  // ─── Sorting ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Sort order for the results. ' +
      '"newest" (default) = most recently posted first; ' +
      '"salary_high" = highest casual rate first; ' +
      '"salary_low" = lowest casual rate first.',
    enum: ['newest', 'salary_high', 'salary_low'],
    default: 'newest',
    example: 'salary_high',
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
