import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Request body for updating per-user notification channel preferences.
 * `PUT /notifications/settings`
 *
 * Both fields are optional — callers can patch only the channel they wish
 * to toggle without resetting the other.
 */
export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({
    description:
      'When true, eligible notification events will also trigger an email ' +
      'dispatch to the user\'s registered address.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, notification events are persisted as in-app notification ' +
      'documents visible inside the application.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;
}
