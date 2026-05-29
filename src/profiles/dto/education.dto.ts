import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEducationDto {
  @ApiProperty({ example: 'HCM City University of Science' })
  @IsString()
  @IsNotEmpty()
  school: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsString()
  @IsOptional()
  major?: string;

  @ApiProperty({ example: '2022 - 2026' })
  @IsString()
  @IsNotEmpty()
  duration: string;

  @ApiPropertyOptional({ example: 'Bachelor' })
  @IsString()
  @IsOptional()
  degree?: string;
}

export class UpdateEducationDto {
  @ApiPropertyOptional({ example: 'HCM City University of Science' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  school?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsString()
  @IsOptional()
  major?: string;

  @ApiPropertyOptional({ example: '2022 - 2026' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ example: 'Bachelor' })
  @IsString()
  @IsOptional()
  degree?: string;
}
