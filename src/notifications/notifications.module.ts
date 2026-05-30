import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationListener } from './notification.listener';
import { MailService } from './mail.service';
import {
  Notification,
  NotificationSchema,
  NotificationSettings,
  NotificationSettingsSchema,
} from './schemas/notification.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    // ─── Mongoose collections ─────────────────────────────────────────────────
    MongooseModule.forFeature([
      // Primary collection — one document per notification event per user
      { name: Notification.name,         schema: NotificationSchema         },

      // Settings collection — one document per user (upserted on first update)
      { name: NotificationSettings.name, schema: NotificationSettingsSchema },

      // User collection — required by NotificationListener to resolve email
      // addresses and display names from candidateId / employerUserId.
      { name: User.name,                 schema: UserSchema                 },
    ]),

    // ─── SMTP Mailer (async so ConfigService is available) ───────────────────
    //
    // Uses TLS/STARTTLS on port 587 by default.  All settings are read from
    // the 'mail.*' config namespace registered in app.module.ts via mail.config.
    //
    // The module is registered here (not globally) to keep SMTP credentials
    // scoped to the Notifications bounded context.
    MailerModule.forRootAsync({
      imports:  [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host:   configService.get<string>('mail.host'),
          port:   configService.get<number>('mail.port'),
          secure: configService.get<number>('mail.port') === 465, // TLS on 465
          auth: {
            user: configService.get<string>('mail.user'),
            pass: configService.get<string>('mail.pass'),
          },
        },
        defaults: {
          from: configService.get<string>('mail.from'),
        },
      }),
      inject: [ConfigService],
    }),
  ],

  controllers: [NotificationsController],

  providers: [
    // ─── Core notification CRUD service ───────────────────────────────────────
    NotificationsService,

    // ─── Decoupled event listener (domain event → in-app + email) ────────────
    // Must be a provider so NestJS registers the @OnEvent() decorators.
    NotificationListener,

    // ─── SMTP delivery abstraction ────────────────────────────────────────────
    MailService,
  ],

  /**
   * Export NotificationsService so other feature modules (e.g. Applications,
   * Jobs) can inject it to dispatch in-app notifications when domain events
   * occur, and so MailService is available if cross-module usage is needed.
   */
  exports: [NotificationsService, MailService],
})
export class NotificationsModule {}
