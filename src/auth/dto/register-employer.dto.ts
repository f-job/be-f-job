import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterEmployerDto {
  @ApiProperty({ example: 'employer@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongP@ss1', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MaxLength(99)
  companyName: string;

  @ApiPropertyOptional({ example: 'A leading technology solutions provider.' })
  @IsOptional()
  @IsString()
  companyDescription?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'Information Technology' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: '50-200' })
  @IsOptional()
  @IsString()
  companySize?: string;

  @ApiPropertyOptional({ example: '456 Innovation St, Tech Park, Vietnam' })
  @IsOptional()
  @IsString()
  address?: string;
}
