import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Allowed identity-document MIME types (Req 7.2). Exported so the service can
 * reuse the exact same set for its defensive guard.
 */
export const ALLOWED_IDENTITY_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

/** Maximum identity-document size in bytes — 10 MB (Req 7.2). */
export const MAX_IDENTITY_FILE_SIZE = 10 * 1024 * 1024;

/** Submission count bounds (Req 7.1, 7.2). */
export const MIN_IDENTITY_DOCS = 1;
export const MAX_IDENTITY_DOCS = 5;

/**
 * A single identity document reference (CCCD / student card) pointing at an
 * already-uploaded file. Validation here enforces Req 7.2 declaratively; the
 * service repeats the checks defensively (Req 7.3).
 */
export class IdentityDocumentDto {
  @ApiProperty({
    description: 'URL of the already-uploaded identity document file.',
    example: 'https://storage.f-job.vn/identity/cccd-front-abc123.jpg',
  })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty({
    description: 'Original file name of the uploaded document.',
    example: 'cccd-front.jpg',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    description:
      'MIME type of the document. Must be one of JPEG, PNG, or PDF.',
    enum: ALLOWED_IDENTITY_MIME_TYPES,
    example: 'image/jpeg',
  })
  @IsIn(ALLOWED_IDENTITY_MIME_TYPES as unknown as string[])
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes. Must be greater than 0 and at most 10 MB.',
    minimum: 1,
    maximum: MAX_IDENTITY_FILE_SIZE,
    example: 524288,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_IDENTITY_FILE_SIZE)
  fileSize: number;
}

/**
 * Payload for POST /verification/submit — "Submit identity documents for review".
 *
 * Accepts between 1 and 5 identity documents in a single request (Req 7.1, 7.2).
 * Each document must be JPEG/PNG/PDF and ≤ 10 MB (Req 7.2). On any validation
 * failure no document is stored and the verification status is unchanged (Req 7.3).
 */
export class SubmitVerificationDto {
  @ApiProperty({
    description:
      'Between 1 and 5 identity documents (CCCD / student card). Each must be ' +
      'JPEG, PNG, or PDF and at most 10 MB.',
    type: [IdentityDocumentDto],
    minItems: MIN_IDENTITY_DOCS,
    maxItems: MAX_IDENTITY_DOCS,
  })
  @IsArray()
  @ArrayMinSize(MIN_IDENTITY_DOCS)
  @ArrayMaxSize(MAX_IDENTITY_DOCS)
  @ValidateNested({ each: true })
  @Type(() => IdentityDocumentDto)
  documents: IdentityDocumentDto[];
}
