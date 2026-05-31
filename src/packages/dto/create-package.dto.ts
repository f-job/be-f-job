import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsInt,
} from 'class-validator';

export class CreatePackageDto {
  @ApiProperty({ description: 'The name of the service package', example: 'Standard Boost Package' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Detailed description of the package', example: 'Provides 50 credits' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Cost of package in VND', example: 100000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Credits granted to employer upon purchase', example: 50 })
  @IsInt()
  @Min(1)
  credits: number;
}
