import { IsEnum, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { JobStatus } from '../../jobs/schemas/job.schema';

export class EmployerJobsQueryDto {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;
}