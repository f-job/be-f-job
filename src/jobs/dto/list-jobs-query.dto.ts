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
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobLevel, JobType } from '../schemas/job.schema';

export class ListJobsQueryDto {
  // ─── Full-text search ───────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Full-text keyword search against title, description, and company name',
    example: 'frontend developer',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  // ─── Location filters ────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Province / city filter', example: 'Hà Nội', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ description: 'District filter', example: 'Cầu Giấy', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  // ─── Salary filters ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Minimum salary filter (VND). Only jobs with salaryMax >= salary_min are returned.',
    example: 10000000,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  salary_min?: number;

  @ApiPropertyOptional({
    description: 'Maximum salary filter (VND). Only jobs with salaryMin <= salary_max are returned.',
    example: 30000000,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  salary_max?: number;

  // ─── Categorical filters ─────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Experience level filter',
    enum: JobLevel,
    example: JobLevel.JUNIOR,
  })
  @IsOptional()
  @IsEnum(JobLevel)
  level?: JobLevel;

  @ApiPropertyOptional({
    description: 'Work arrangement type',
    enum: JobType,
    example: JobType.HYBRID,
  })
  @IsOptional()
  @IsEnum(JobType)
  job_type?: JobType;

  @ApiPropertyOptional({
    description: 'Industry / field filter',
    example: 'IT',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({
    description: 'Filter urgent jobs only (true/false)',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  })
  @IsBoolean()
  is_urgent?: boolean;

  // ─── Sorting ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Sort order',
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

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
