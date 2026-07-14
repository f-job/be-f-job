import { IsArray, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class UpdateEmployerBranchDto {
  @IsString()
  name: string;

  @IsString()
  address: string;
}

export class UpdateEmployerDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  companyDescription?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  companySize?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  englishName?: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  businessRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  legalRepresentative?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateEmployerBranchDto)
  branches?: UpdateEmployerBranchDto[];

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;
}
