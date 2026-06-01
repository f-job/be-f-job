import {
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateInterviewDto {
  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  note?: string;
}