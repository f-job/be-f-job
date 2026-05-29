import { IsNotEmpty, IsString } from 'class-validator';

export class RejectEmployerDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}