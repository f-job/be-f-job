import {
    IsArray,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    IsDate,
} from 'class-validator';

import { Type } from 'class-transformer';

import {
    CasualJobType,
    ExperienceLevel,
    SalaryType,
} from '../../jobs/schemas/job.schema';

export class CreateEmployerJobDto {
    @IsString()
    title?: string;

    @IsString()
    description: string;

    @IsString()
    location: string;

    @IsOptional()
    @IsString()
    district: string;

    @IsEnum(SalaryType)
    salaryType: SalaryType;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    salaryAmount: number;

    @IsEnum(ExperienceLevel)
    level: ExperienceLevel;

    @IsEnum(CasualJobType)
    jobType: CasualJobType;

    @IsString()
    industry: string;

    @IsString()
    workingTimeText: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    slots?: number;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    expiresAt?: Date;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    benefits?: string[];
}