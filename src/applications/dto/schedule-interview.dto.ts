// dto/schedule-interview.dto.ts

import {
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class ScheduleInterviewDto {
  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  employerNote?: string;
}