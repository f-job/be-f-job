import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExperienceDto {
  @ApiProperty({ example: 'Waiter' })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({ example: 'White Palace' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 'White Palace' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '3 months' })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ example: 'Phục vụ tiệc cưới' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateExperienceDto {
  @ApiPropertyOptional({ example: 'Waiter' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ example: 'White Palace' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  companyName?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 'White Palace' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '3 months' })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ example: 'Phục vụ tiệc cưới' })
  @IsString()
  @IsOptional()
  description?: string;
}
