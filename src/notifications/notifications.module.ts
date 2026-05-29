import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {
  Notification,
  NotificationSchema,
  NotificationSettings,
  NotificationSettingsSchema,
} from './schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      // Primary collection — one document per notification event per user
      { name: Notification.name, schema: NotificationSchema },

      // Settings collection — one document per user (upserted on first preference update)
      { name: NotificationSettings.name, schema: NotificationSettingsSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers:   [NotificationsService],
  /**
   * Export NotificationsService so other feature modules (e.g. Applications,
   * Jobs) can inject it to dispatch in-app notifications when relevant domain
   * events occur (e.g. application status change, new job match).
   */
  exports:     [NotificationsService],
})
export class NotificationsModule {}
