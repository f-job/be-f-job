import {
  IsArray,
  IsString,
} from 'class-validator';

export class BulkRejectDto {
  @IsArray()
  applicationIds: string[];

  @IsString()
  reason: string;
}