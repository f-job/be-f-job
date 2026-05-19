import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewStrongP@ss1', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
