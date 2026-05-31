import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportReason, ReportTargetType } from '../schemas/report.schema';

/**
 * Payload for POST /reports — "File a report against a JOB or another USER".
 *
 * A report records a user's complaint about a fake/scam job or an abusive user.
 * The reporter identity is taken from the authenticated JWT (never the body),
 * so it is intentionally absent here.
 *
 * Validation (Req 10.3, 10.4, 10.7):
 *   - `reason` must be exactly one value from the predefined {@link ReportReason} set.
 *   - `description` is optional and capped at 1000 characters.
 */
export class CreateReportDto {
  @ApiProperty({
    description: 'The kind of entity being reported — a JOB posting or a USER.',
    enum: ReportTargetType,
    example: ReportTargetType.JOB,
  })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({
    description:
      'MongoDB ObjectId of the reported entity. ' +
      'A Job._id when targetType is "JOB", or a User._id when targetType is "USER".',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsMongoId()
  targetId: string;

  @ApiProperty({
    description: 'Reason category for the report; exactly one predefined value.',
    enum: ReportReason,
    example: ReportReason.SCAM,
  })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({
    description:
      'Optional free-text description giving context for the report. ' +
      'At most 1000 characters.',
    maxLength: 1000,
    example: 'This listing asks applicants to pay a deposit before the interview.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
