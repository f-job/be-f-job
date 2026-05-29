import { IsOptional, IsString, IsUrl, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCandidateDto {
  @ApiPropertyOptional({ description: 'Full name of the candidate', example: 'Nguyen Van A', maxLength: 99 })
  @IsOptional()
  @IsString()
  @MaxLength(99)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Vietnamese phone number',
    example: '0912345678',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(\+84|0)[3-9]\d{8}$/, {
    message: 'phone must be a valid Vietnamese phone number (e.g. 0912345678 or +84912345678)',
  })
  phone?: string;

  @ApiPropertyOptional({ description: 'Residential address', example: '123 Lê Lợi, Q1, TP.HCM', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({
    description: 'URL to uploaded resume / CV file',
    example: 'https://cdn.example.com/resume.pdf',
  })
  @IsOptional()
  @IsUrl({}, { message: 'resumeUrl must be a valid URL' })
  resumeUrl?: string;

  @ApiPropertyOptional({
    description: 'URL to profile avatar image (JPG, PNG, WEBP — max 2 MB)',
    example: 'https://cdn.example.com/avatar.webp',
  })
  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl must be a valid URL' })
  avatarUrl?: string;
}
