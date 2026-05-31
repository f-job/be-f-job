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
  ApplicationCompletedEvent,
  ApplicationNoShowEvent,
} from './events/application.events';
import { ReviewCreatedEvent } from './events/review.events';
import { VerificationDecidedEvent } from './events/verification.events';
import { ReportCreatedEvent, ReportResolvedEvent } from './events/report.events';
import { NotificationType } from './schemas/notification.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';

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

  // ─── Private helper: conditional lifecycle email ─────────────────────────────

  /**
   * Conditionally dispatches a lifecycle status email to a single recipient,
   * reusing the existing `sendApplicationStatusEmail` template (recipient name +
   * status tag + optional note + CTA link).  The send is gated on the recipient's
   * `emailEnabled` preference — when disabled, the email is silently suppressed
   * (the in-app notification persisted by the caller is the authoritative signal).
   *
   * @param recipientUserId User._id of the email recipient.
   * @param applicationId   Application ObjectId string (for the CTA deep-link).
   * @param jobTitle        Job shift title (email body context).
   * @param companyName     Employer company name (email body context).
   * @param statusLabel     Human-readable status label rendered in the email.
   * @param note            Optional note rendered in the email body.
   */
  private async dispatchLifecycleEmail(
    recipientUserId: string,
    applicationId:   string,
    jobTitle:        string,
    companyName:     string,
    statusLabel:     string,
    note?:           string,
  ): Promise<void> {
    const settings = await this.notificationsService.getSettings(recipientUserId);

    if (!settings.emailEnabled) {
      this.logger.debug(
        `[NotificationListener] Email suppressed for user ${recipientUserId} (emailEnabled=false)`,
      );
      return;
    }

    const recipientEmail = await this.resolveEmail(recipientUserId);
    if (!recipientEmail) return;

    // Resolve recipient display name for the email greeting.
    const recipientUser = await this.userModel
      .findById(recipientUserId)
      .select('fullName')
      .lean<UserDocument>();

    const frontendUrl    = this.configService.get<string>('app.frontendUrl') ?? 'http://localhost:3000';
    const applicationUrl = `${frontendUrl}/applications/${applicationId}`;

    await this.mailService.sendApplicationStatusEmail(recipientEmail, {
      candidateFullName: recipientUser?.fullName ?? 'Người dùng',
      jobTitle,
      companyName,
      newStatus:    statusLabel,
      employerNote: note,
      applicationUrl,
    });
  }

  // ─── Handler 3: application.completed ────────────────────────────────────────

  /**
   * Fires when an Employer marks an Accepted application as Completed.
   * Target recipients: BOTH the Candidate who worked the shift AND the Employer
   * who owns the job — each is told the engagement is complete and that a Review
   * may now be submitted.
   *
   * Steps:
   *   1. Persist an in-app JOB_COMPLETED notification for the candidate AND the employer.
   *   2. For EACH recipient, if their emailEnabled → dispatch HTML email via MailService.
   */
  @OnEvent('application.completed', { async: true })
  async onApplicationCompleted(event: ApplicationCompletedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] application.completed — applicationId: ${event.applicationId}`,
    );

    try {
      const title = `Công việc đã hoàn thành: "${event.jobTitle}"`;
      const body  = `Công việc "${event.jobTitle}" tại ${event.companyName} đã hoàn thành. Bạn có thể để lại đánh giá ngay bây giờ.`;
      const metadata = {
        applicationId: event.applicationId,
        jobTitle:      event.jobTitle,
        companyName:   event.companyName,
      };

      // ── Step 1: In-app notifications for BOTH parties (always persisted) ─────
      await this.notificationsService.createAndDispatch(event.candidateUserId, {
        type: NotificationType.JOB_COMPLETED,
        title,
        body,
        metadata,
      });

      await this.notificationsService.createAndDispatch(event.employerUserId, {
        type: NotificationType.JOB_COMPLETED,
        title,
        body,
        metadata,
      });

      // ── Step 2: Email per recipient (conditional on emailEnabled) ────────────
      await this.dispatchLifecycleEmail(
        event.candidateUserId,
        event.applicationId,
        event.jobTitle,
        event.companyName,
        'Completed',
        'Công việc đã hoàn thành. Bạn có thể để lại đánh giá cho đối tác của mình.',
      );

      await this.dispatchLifecycleEmail(
        event.employerUserId,
        event.applicationId,
        event.jobTitle,
        event.companyName,
        'Completed',
        'Công việc đã hoàn thành. Bạn có thể để lại đánh giá cho ứng viên.',
      );
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling application.completed for ${event.applicationId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Handler 4: application.no_show ──────────────────────────────────────────

  /**
   * Fires when an Employer reports that a Candidate did not show up for an
   * Accepted (and scheduled) shift.
   * Target recipient: the Candidate against whom the no-show was recorded.
   *
   * Steps:
   *   1. Persist an in-app JOB_COMPLETED notification for the candidate.
   *   2. If candidate's emailEnabled → dispatch HTML email via MailService.
   */
  @OnEvent('application.no_show', { async: true })
  async onApplicationNoShow(event: ApplicationNoShowEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] application.no_show — applicationId: ${event.applicationId}`,
    );

    try {
      // ── Step 1: In-app notification (always persisted) ─────────────────────
      await this.notificationsService.createAndDispatch(event.candidateUserId, {
        type:  NotificationType.JOB_COMPLETED,
        title: `Ghi nhận vắng mặt: "${event.jobTitle}"`,
        body:  `Một lượt vắng mặt (no-show) đã được ghi nhận đối với bạn cho ca "${event.jobTitle}" tại ${event.companyName}. Điều này có thể ảnh hưởng đến Điểm uy tín của bạn.`,
        metadata: {
          applicationId: event.applicationId,
          jobTitle:      event.jobTitle,
          companyName:   event.companyName,
        },
      });

      // ── Step 2: Email (conditional on emailEnabled) ────────────────────────
      await this.dispatchLifecycleEmail(
        event.candidateUserId,
        event.applicationId,
        event.jobTitle,
        event.companyName,
        'NoShow',
        'Một lượt vắng mặt đã được ghi nhận đối với bạn. Điều này có thể ảnh hưởng đến Điểm uy tín của bạn.',
      );
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling application.no_show for ${event.applicationId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Handler 5: review.created ───────────────────────────────────────────────

  /**
   * Fires when a Review is successfully created for a Completed application.
   * Target recipient: the reviewee (the User being reviewed — candidate or employer).
   *
   * Steps:
   *   1. Persist an in-app REVIEW_RECEIVED notification for the reviewee (always).
   *   2. If the reviewee's emailEnabled → attempt an email.
   *
   * Email note: MailService currently only exposes application-pipeline templates
   * (`sendApplicationReceivedEmail` / `sendApplicationStatusEmail`), which require
   * job/company/status context the review event does not carry. Rather than render
   * a misleading email (or call a non-existent template method, which would break
   * compilation), the in-app notification is the authoritative signal for Req 14.1.
   * When the reviewee has email enabled we log that no dedicated review email
   * template applies; a future MailService.sendReviewReceivedEmail can slot in here.
   */
  @OnEvent('review.created', { async: true })
  async onReviewCreated(event: ReviewCreatedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] review.created — reviewId: ${event.reviewId}, reviewee: ${event.revieweeUserId}`,
    );

    try {
      // ── Step 1: In-app notification (always persisted) ─────────────────────
      await this.notificationsService.createAndDispatch(event.revieweeUserId, {
        type:  NotificationType.REVIEW_RECEIVED,
        title: 'Bạn nhận được một đánh giá mới',
        body:  `${event.reviewerDisplayName} đã để lại cho bạn một đánh giá ${event.rating} sao.`,
        metadata: {
          reviewId:      event.reviewId,
          applicationId: event.applicationId,
          rating:        event.rating,
        },
      });

      // ── Step 2: Email (conditional on emailEnabled) ────────────────────────
      const settings = await this.notificationsService.getSettings(event.revieweeUserId);

      if (!settings.emailEnabled) {
        this.logger.debug(
          `[NotificationListener] Email suppressed for reviewee ${event.revieweeUserId} (emailEnabled=false)`,
        );
        return;
      }

      // No dedicated review email template exists on MailService — the in-app
      // notification persisted above is the authoritative Req 14.1 signal.
      this.logger.debug(
        `[NotificationListener] review.created email skipped for reviewee ${event.revieweeUserId} — no review email template available (in-app notification persisted)`,
      );
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling review.created for ${event.reviewId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Handler 6: verification.decided ─────────────────────────────────────────

  /**
   * Fires when an Admin approves or rejects a candidate's identity verification
   * submission.
   * Target recipient: the Candidate who submitted the identity documents.
   *
   * Steps:
   *   1. Persist an in-app VERIFICATION_RESULT notification for the candidate (always).
   *      Vietnamese copy varies by outcome:
   *        • VERIFIED → success title/body confirming the account is verified.
   *        • REJECTED → rejection title/body, appending the reason when provided.
   *   2. If the candidate's emailEnabled → attempt an email.
   *
   * Email note: MailService currently only exposes application-pipeline templates
   * (`sendApplicationReceivedEmail` / `sendApplicationStatusEmail`), which require
   * job/company/status context the verification event does not carry. Rather than
   * render a misleading email (or call a non-existent template method, which would
   * break compilation), the in-app notification is the authoritative signal for
   * Req 8.4 / 14.2. When the candidate has email enabled we log that no dedicated
   * verification email template applies; a future
   * MailService.sendVerificationResultEmail can slot in here.
   */
  @OnEvent('verification.decided', { async: true })
  async onVerificationDecided(event: VerificationDecidedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] verification.decided — candidate: ${event.candidateUserId}, status: ${event.status}`,
    );

    try {
      // ── Step 1: In-app notification (always persisted) ─────────────────────
      const isVerified = event.status === 'VERIFIED';

      const title = isVerified
        ? 'Xác minh danh tính thành công'
        : 'Xác minh danh tính bị từ chối';

      const body = isVerified
        ? 'Chúc mừng! Danh tính của bạn đã được xác minh thành công. Tài khoản của bạn hiện đã được xác minh.'
        : `Rất tiếc, yêu cầu xác minh danh tính của bạn đã bị từ chối.${
            event.reason ? ` Lý do: ${event.reason}` : ''
          }`;

      await this.notificationsService.createAndDispatch(event.candidateUserId, {
        type: NotificationType.VERIFICATION_RESULT,
        title,
        body,
        metadata: {
          status: event.status,
          reason: event.reason,
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

      // No dedicated verification email template exists on MailService — the
      // in-app notification persisted above is the authoritative Req 8.4 / 14.2
      // signal.
      this.logger.debug(
        `[NotificationListener] verification.decided email skipped for candidate ${event.candidateUserId} — no verification email template available (in-app notification persisted)`,
      );
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling verification.decided for ${event.candidateUserId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Handler 7: report.created ───────────────────────────────────────────────

  /**
   * Fires when a User submits a new Report against a target entity (job, user, …).
   * Target recipients: ALL Admins (moderation-queue awareness, Req 10.9).
   *
   * Steps:
   *   1. Query every User whose role === UserRole.ADMIN.
   *   2. Persist an in-app REPORT_UPDATE notification for EACH admin (always).
   *   3. Per admin, if emailEnabled → attempt an email.
   *
   * Email note: MailService currently only exposes application-pipeline templates
   * (`sendApplicationReceivedEmail` / `sendApplicationStatusEmail`), which require
   * job/company/status context the report event does not carry. Rather than render
   * a misleading email (or call a non-existent template method, which would break
   * compilation), the in-app notification is the authoritative signal for Req 10.9.
   * When an admin has email enabled we log that no dedicated report email template
   * applies; a future MailService.sendReportCreatedEmail can slot in here.
   */
  @OnEvent('report.created', { async: true })
  async onReportCreated(event: ReportCreatedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] report.created — reportId: ${event.reportId}, target: ${event.targetType}/${event.targetId}`,
    );

    try {
      // ── Step 1: Resolve all admin recipients ───────────────────────────────
      const admins = await this.userModel
        .find({ role: UserRole.ADMIN })
        .select('_id')
        .lean<UserDocument[]>();

      if (!admins.length) {
        this.logger.warn(
          `[NotificationListener] report.created — no admin recipients found for report ${event.reportId}`,
        );
        return;
      }

      const title = 'Báo cáo mới cần xem xét';
      const body  = `Một báo cáo mới đối với ${event.targetType} vừa được gửi và đang chờ xử lý trong hàng đợi kiểm duyệt.`;
      const metadata = {
        reportId:   event.reportId,
        targetType: event.targetType,
        targetId:   event.targetId,
      };

      // ── Step 2 + 3: Per-admin in-app notification (always) + conditional email
      for (const admin of admins) {
        const adminId = admin._id.toString();

        // In-app notification (always persisted)
        await this.notificationsService.createAndDispatch(adminId, {
          type: NotificationType.REPORT_UPDATE,
          title,
          body,
          metadata,
        });

        // Email (conditional on emailEnabled)
        const settings = await this.notificationsService.getSettings(adminId);

        if (!settings.emailEnabled) {
          this.logger.debug(
            `[NotificationListener] Email suppressed for admin ${adminId} (emailEnabled=false)`,
          );
          continue;
        }

        // No dedicated report email template exists on MailService — the in-app
        // notification persisted above is the authoritative Req 10.9 signal.
        this.logger.debug(
          `[NotificationListener] report.created email skipped for admin ${adminId} — no report email template available (in-app notification persisted)`,
        );
      }
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling report.created for ${event.reportId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Handler 8: report.resolved ──────────────────────────────────────────────

  /**
   * Fires when an Admin resolves or dismisses a report.
   * Target recipient: the reporter who originally submitted the report
   * (Req 11.6, 14.3).
   *
   * Steps:
   *   1. Persist an in-app REPORT_UPDATE notification for the reporter (always).
   *      Vietnamese copy varies by outcome:
   *        • RESOLVED  → confirms the report was actioned.
   *        • DISMISSED → confirms the report was reviewed and dismissed.
   *   2. If the reporter's emailEnabled → attempt an email.
   *
   * Email note: as with report.created, no dedicated report email template exists
   * on MailService, so the in-app notification is the authoritative signal. When
   * the reporter has email enabled we log that no template applies; a future
   * MailService.sendReportResolvedEmail can slot in here.
   */
  @OnEvent('report.resolved', { async: true })
  async onReportResolved(event: ReportResolvedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] report.resolved — reportId: ${event.reportId}, status: ${event.status}`,
    );

    try {
      // ── Step 1: In-app notification (always persisted) ─────────────────────
      const isResolved = event.status === 'RESOLVED';

      const title = isResolved
        ? 'Báo cáo của bạn đã được xử lý'
        : 'Báo cáo của bạn đã được xem xét và bỏ qua';

      const body = isResolved
        ? 'Báo cáo bạn đã gửi đã được quản trị viên xem xét và xử lý. Cảm ơn bạn đã góp phần giữ an toàn cho cộng đồng.'
        : 'Báo cáo bạn đã gửi đã được quản trị viên xem xét và quyết định bỏ qua. Cảm ơn bạn đã góp phần giữ an toàn cho cộng đồng.';

      await this.notificationsService.createAndDispatch(event.reporterUserId, {
        type: NotificationType.REPORT_UPDATE,
        title,
        body,
        metadata: {
          reportId: event.reportId,
          status:   event.status,
        },
      });

      // ── Step 2: Email (conditional on emailEnabled) ────────────────────────
      const settings = await this.notificationsService.getSettings(event.reporterUserId);

      if (!settings.emailEnabled) {
        this.logger.debug(
          `[NotificationListener] Email suppressed for reporter ${event.reporterUserId} (emailEnabled=false)`,
        );
        return;
      }

      // No dedicated report email template exists on MailService — the in-app
      // notification persisted above is the authoritative Req 11.6 / 14.3 signal.
      this.logger.debug(
        `[NotificationListener] report.resolved email skipped for reporter ${event.reporterUserId} — no report email template available (in-app notification persisted)`,
      );
    } catch (err) {
      // ── Isolation: catch ALL errors so the event loop never propagates ──────
      this.logger.error(
        `[NotificationListener] Error handling report.resolved for ${event.reportId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
