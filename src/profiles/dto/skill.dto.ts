import { IsString, IsNotEmpty, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddSkillDto {
  @ApiProperty({ example: 'Customer Service' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 4, description: 'Proficiency rating from 1 to 5' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;
}
