import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CvType } from '../schemas/application.schema';

/**
 * Payload for POST /applications — "Apply to a casual job shift".
 *
 * Three submission modes are supported:
 *   'online' → uses the candidate's pre-built online profile (no URL needed).
 *   'pdf'    → candidate uploads a PDF; cvPdfUrl is required.
 *   'quick'  → quick-apply with minimal info; no CV attachment required.
 */
export class CreateApplicationDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the casual job to apply for.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsMongoId()
  jobId: string;

  @ApiProperty({
    description:
      'CV submission mode. ' +
      '"online" = pre-built profile, "pdf" = uploaded PDF, "quick" = quick-apply.',
    enum: CvType,
    example: CvType.ONLINE,
  })
  @IsEnum(CvType)
  cvType: CvType;

  @ApiPropertyOptional({
    description:
      'URL to the uploaded PDF CV. Required when cvType is "pdf". ' +
      'Must be a valid HTTPS URL pointing to the stored file.',
    example: 'https://storage.f-job.vn/cvs/nguyen-van-a-2024.pdf',
  })
  @IsOptional()
  @IsUrl()
  // cvPdfUrl is mandatory only when the candidate selects the 'pdf' mode.
  @ValidateIf((o) => o.cvType === CvType.PDF)
  cvPdfUrl?: string;

  @ApiPropertyOptional({
    description:
      'Optional cover letter / motivation note. ' +
      'Kept concise (max 2,000 chars) appropriate for casual shift applications.',
    maxLength: 2000,
    example: 'Em có kinh nghiệm 6 tháng phục vụ tại nhà hàng, có thể bắt đầu ngay tối nay.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverLetter?: string;
}
