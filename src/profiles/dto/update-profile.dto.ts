import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: '0987654321' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '123 Main St, District 1, HCM City' })
  @IsString()
  @IsOptional()
  address?: string;
}
