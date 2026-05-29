import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCandidateStatusDto {
  @ApiProperty({
    description: 'Set to true to signal the candidate is actively looking for work',
    example: true,
  })
  @IsBoolean()
  openToWork: boolean;
}
