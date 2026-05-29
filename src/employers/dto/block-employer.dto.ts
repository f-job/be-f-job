import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BlockEmployerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  blockedReason: string;
}