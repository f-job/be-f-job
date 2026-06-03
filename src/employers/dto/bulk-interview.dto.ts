import {
  IsArray,
  IsDateString,
} from 'class-validator';

export class BulkInterviewDto {
  @IsArray()
  applicationIds: string[];

  @IsDateString()
  scheduledAt: string;
}