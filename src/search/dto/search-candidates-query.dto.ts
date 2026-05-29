import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SearchCandidatesQueryDto {
  // ─── Skills ──────────────────────────────────────────────────────────────────

  /**
   * Comma-separated list of skills to match against the candidate's `skills` array.
   * Parsed internally into a $in array query.
   * Example: "Pha chế,Phục vụ" → { skills: { $in: ['Pha chế', 'Phục vụ'] } }
   */
  @ApiPropertyOptional({
    description:
      'Comma-separated skill names to match against candidate skill sets ' +
      '(case-sensitive $in match). Aligns with /skills master data. ' +
      'Example: "Pha chế,Phục vụ,Lái xe máy".',
    example: 'Pha chế,Phục vụ',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  skills?: string;

  // ─── Location / Province ─────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Province / city filter matched against candidate `address` field ' +
      '(case-insensitive, partial regex). ' +
      'Example: "Hồ Chí Minh" matches addresses containing that string.',
    example: 'Hồ Chí Minh',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  // ─── Summary / Bio Context ───────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Contextual keyword matched against the candidate `bio` field using a ' +
      'case-insensitive regex. Useful for finding candidates who mention ' +
      'specific experiences in their introduction.',
    example: 'pha chế trà sữa',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;

  // ─── Availability ────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter to candidates actively seeking work (openToWork = true).',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true'  || value === true  || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  })
  @IsBoolean()
  openToWork?: boolean;

  // ─── Pagination ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Page number (1-indexed)', example: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
