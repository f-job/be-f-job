import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Payload for PUT /admin/jobs/:id/urgent.
 * Omit `isUrgent` to toggle the current value; provide it to set explicitly.
 */
export class SetUrgentDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Explicit urgent flag. If omitted, the current value is toggled.',
  })
  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;
}
