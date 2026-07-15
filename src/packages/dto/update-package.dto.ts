import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  Min,
  IsOptional,
  IsInt,
  IsBoolean,
} from 'class-validator';

export class UpdatePackageDto {
  @ApiPropertyOptional({ description: 'The name of the service package', example: 'Premium Package' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the package', example: 'Provides 100 credits' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Cost of package in VND', example: 200000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ description: 'Credits granted to employer upon purchase', example: 100 })
  @IsInt()
  @Min(1)
  @IsOptional()
  credits?: number;

  @ApiPropertyOptional({ description: 'Flag to enable/disable package purchasing', example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Expiry duration in days', example: 30 })
  @IsInt()
  @Min(1)
  @IsOptional()
  durationDays?: number;

  @ApiPropertyOptional({ description: 'Discount percentage', example: 10 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @ApiPropertyOptional({ description: 'Flag to highlight popular packages', example: true })
  @IsBoolean()
  @IsOptional()
  isPopular?: boolean;
}
