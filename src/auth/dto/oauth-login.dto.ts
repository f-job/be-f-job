import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OAuthLoginDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIs...', description: 'Google ID Token or Facebook Access Token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
