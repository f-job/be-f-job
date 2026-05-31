import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload for PATCH /admin/reports/:id/dismiss — "Dismiss a report".
 *
 * The dismissing admin must supply a reason of at most 1,000 characters, which
 * is recorded on the report alongside the dismissing admin and timestamp
 * (Req 11.5). A missing/empty reason or one exceeding 1,000 characters is
 * rejected by the global `ValidationPipe` (ERR_3001) and the report's status is
 * left unchanged.
 */
export class DismissReportDto {
  @ApiProperty({
    description: 'Reason for dismissing the report (required, max 1,000 characters).',
    maxLength: 1000,
    example: 'Report does not violate platform policy after review.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
