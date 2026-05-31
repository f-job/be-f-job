import { IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { JobStatus } from '../schemas/job.schema';

export class AdminJobsQueryDto {
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
