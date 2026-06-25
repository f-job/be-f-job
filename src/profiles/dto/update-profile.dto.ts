import { IsString, IsOptional, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  fullName?: string;

  @ApiProperty({ example: '0987654321' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+84|0)[3-9]\d{8}$/, {
    message: 'phone must be a valid Vietnamese phone number (e.g. 0912345678 or +84912345678)',
  })
  phone: string;

  @ApiPropertyOptional({ example: '123 Main St, District 1, HCM City' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Fullstack Developer chuyên chạy event F&B' })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiPropertyOptional({ example: 'Ho Chi Minh' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 'District 1' })
  @IsString()
  @IsOptional()
  district?: string;
}
