import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { MailService } from './mail.service';
import {
  ApplicationCreatedEvent,
  ApplicationStatusUpdatedEvent,
} from './events/application.events';
import { NotificationType } from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationListener
//
// Decoupled event consumer that reacts to Application domain events emitted by
// ApplicationsService.  Each handler runs asynchronously and is completely
// isolated from the HTTP request lifecycle — errors are caught and logged
// locally so a mailing failure never crashes the core application thread.
//
// Handler execution order for each event:
//   1. Persist in-app Notification document (always).
//   2. Read recipient's NotificationSettings (emailEnabled flag).
//   3. Conditionally dispatch an HTML email via MailService.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly mailService:          MailService,
    private readonly configService:        ConfigService,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ─── Private helper ────────────────────────────────────────────────────────

  /**
   * Looks up a User document by string ID and returns the registered email.
   * Returns null (and logs a warning) when the user cannot be found, so callers
   * can gracefully skip the email step.
   */
  private async resolveEmail(userId: string): Promise<string | null> {
    const user = await this.userModel
      .findById(userId)
      .select('email')
      .lean<UserDocument>();

    if (!user) {
      this.logger.warn(`[NotificationListener] User not found: ${userId}`);
      return null;
    }

    return user.email;
  }

  // ─── Handler 1: application.created ───────────────────────────────────────

  /**
   * Fires when a Candidate submits a new application.
   * Target recipient: the Employer who owns the job vacancy.
   *
   * Steps:
   *   1. Persist an in-app notification for the employer.
   *   2. If employer's emailEnabled → dispatch HTML email via MailService.
   */
  @OnEvent('application.created', { async: true })
  async onApplicationCreated(event: ApplicationCreatedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] application.created — applicationId: ${event.applicationId}`,
    );

    try {
      // ── Step 1: In-app notification (always persisted) ─────────────────────
      await this.notificationsService.createAndDispatch(event.employerUserId, {
        type:  NotificationType.APPLICATION_STATUS,
        title: `Ứng viên mới cho "${event.jobTitle}"`,
        body:  `${event.candidateFullName} vừa ứng tuyển vào ca làm việc "${event.jobTitle}" tại ${event.companyName}.`,
        metadata: {
          applicationId: event.applicationId,
          jobId:         event.jobId,
          candidateId:   event.candidateId,
        },
      });

      // ── Step 2: Email (conditional on emailEnabled) ────────────────────────
      const settings = await this.notificationsService.getSettings(event.employerUserId);

      if (!settings.emailEnabled) {
        this.logger.debug(
          `[NotificationListener] Email suppressed for employer ${event.employerUserId} (emailEnabled=false)`,
        );
        return;
      }

      const employerEmail = await this.resolveEmail(event.employerUserId);
      if (!employerEmail) return;

      const frontendUrl = this.configService.get<string>('app.frontendUrl') ?? 'http://localhost:3000';
      const applicationUrl = `${frontendUrl}/employer/applications/${event.applicationId}`;

      await this.mailService.sendApplicationReceivedEmail(employerEmail, {
        employerName:      '',   // Employer fullName is optional — greeting falls back to generic
        candidateFullName: event.candidateFullName,
        jobTitle:          event.jobTitle,
        companyName:       event.companyName,
        applicationUrl,
      });
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling application.created for ${event.applicationId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Handler 2: application.status_updated ────────────────────────────────

  /**
   * Fires when an Employer transitions an application's status
   * (Accepted / Rejected / Scheduled / Viewed).
   * Target recipient: the Candidate who authored the application.
   *
   * Steps:
   *   1. Persist an in-app notification for the candidate.
   *   2. If candidate's emailEnabled → dispatch HTML email via MailService.
   */
  @OnEvent('application.status_updated', { async: true })
  async onApplicationStatusUpdated(event: ApplicationStatusUpdatedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] application.status_updated — applicationId: ${event.applicationId} → ${event.newStatus}`,
    );

    try {
      // ── Step 1: In-app notification (always persisted) ─────────────────────
      const inAppBody =
        event.newStatus === 'Accepted'
          ? `Chúc mừng! Đơn ứng tuyển của bạn cho ca "${event.jobTitle}" tại ${event.companyName} đã được CHẤP NHẬN.`
          : event.newStatus === 'Rejected'
          ? `Rất tiếc, đơn ứng tuyển của bạn cho ca "${event.jobTitle}" tại ${event.companyName} đã bị từ chối.`
          : `Trạng thái đơn ứng tuyển của bạn cho ca "${event.jobTitle}" đã chuyển sang "${event.newStatus}".`;

      await this.notificationsService.createAndDispatch(event.candidateUserId, {
        type:  NotificationType.APPLICATION_STATUS,
        title: `Cập nhật ứng tuyển: ${event.newStatus}`,
        body:  inAppBody,
        metadata: {
          applicationId: event.applicationId,
          newStatus:     event.newStatus,
          employerNote:  event.employerNote,
        },
      });

      // ── Step 2: Email (conditional on emailEnabled) ────────────────────────
      const settings = await this.notificationsService.getSettings(event.candidateUserId);

      if (!settings.emailEnabled) {
        this.logger.debug(
          `[NotificationListener] Email suppressed for candidate ${event.candidateUserId} (emailEnabled=false)`,
        );
        return;
      }

      const candidateEmail = await this.resolveEmail(event.candidateUserId);
      if (!candidateEmail) return;

      // Resolve candidate display name for the email greeting
      const candidateUser = await this.userModel
        .findById(event.candidateUserId)
        .select('fullName')
        .lean<UserDocument>();

      await this.mailService.sendApplicationStatusEmail(candidateEmail, {
        candidateFullName: candidateUser?.fullName ?? 'Ứng viên',
        jobTitle:          event.jobTitle,
        companyName:       event.companyName,
        newStatus:         event.newStatus,
        employerNote:      event.employerNote,
        applicationUrl:    event.applicationUrl,
      });
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling application.status_updated for ${event.applicationId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
