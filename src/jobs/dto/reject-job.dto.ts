import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Payload for PUT /admin/jobs/:id/reject.
 * The rejection reason is optional but recommended so the employer
 * understands why their posting was declined.
 */
export class RejectJobDto {
  @ApiPropertyOptional({
    example: 'Mô tả công việc không rõ ràng, vui lòng bổ sung ca làm và mức lương.',
    description: 'Reason shown to the employer explaining the rejection.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
