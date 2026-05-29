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
  location: string;

  @ApiProperty({ example: '3 months' })
  @IsString()
  @IsNotEmpty()
  duration: string;

  @ApiPropertyOptional({ example: 'Served food and drinks for events' })
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
  location?: string;

  @ApiPropertyOptional({ example: '3 months' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ example: 'Served food and drinks for events' })
  @IsString()
  @IsOptional()
  description?: string;
}
