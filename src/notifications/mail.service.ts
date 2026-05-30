import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

// ─── Email Template Helpers ───────────────────────────────────────────────────

/**
 * Renders the shared outer HTML wrapper (header + footer) used by all F-Job
 * notification emails.  Keeps brand consistency without requiring a template
 * engine dependency.
 */
function wrapHtml(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#f4f7fb; font-family: 'Segoe UI', Arial, sans-serif; color:#333; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header  { background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%); padding:28px 32px; text-align:center; }
    .header  h1 { margin:0; color:#fff; font-size:22px; font-weight:700; letter-spacing:.5px; }
    .header  span { color:#aacfff; font-size:13px; }
    .body    { padding:32px; }
    .body    p  { margin:0 0 16px; line-height:1.65; font-size:15px; }
    .body    h2 { margin:0 0 10px; font-size:18px; color:#1a73e8; }
    .tag     { display:inline-block; background:#e8f0fe; color:#1a73e8; padding:3px 10px; border-radius:12px; font-size:13px; font-weight:600; }
    .tag.green  { background:#e6f4ea; color:#1e7e34; }
    .tag.red    { background:#fce8e6; color:#c5221f; }
    .tag.orange { background:#fef3e2; color:#b06000; }
    .cta     { display:block; width:fit-content; margin:24px auto 0; padding:13px 32px; background:#1a73e8; color:#fff !important; text-decoration:none; border-radius:8px; font-size:15px; font-weight:600; letter-spacing:.3px; }
    .cta:hover { background:#0d47a1; }
    .divider { border:none; border-top:1px solid #e8eaf0; margin:24px 0; }
    .footer  { background:#f4f7fb; padding:18px 32px; text-align:center; font-size:12px; color:#888; }
    .footer  a { color:#1a73e8; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏷️ F-Job</h1>
      <span>Marketplace việc làm bán thời gian & sự kiện</span>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Bạn nhận email này vì bạn là thành viên của F-Job.<br />
      Mọi thắc mắc, vui lòng liên hệ <a href="mailto:support@fjob.vn">support@fjob.vn</a>.<br />
      © 2026 F-Job. Bảo lưu mọi quyền.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

// ─── Payload Types ────────────────────────────────────────────────────────────

export interface ApplicationReceivedEmailData {
  employerName:      string; // greeting name for the employer
  candidateFullName: string;
  jobTitle:          string;
  companyName:       string;
  applicationUrl:    string; // deep-link into the employer ATS view
}

export interface ApplicationStatusEmailData {
  candidateFullName: string;
  jobTitle:          string;
  companyName:       string;
  newStatus:         string; // "Accepted" | "Rejected" | "Scheduled" | …
  employerNote?:     string; // optional rejection reason / employer message
  applicationUrl:    string; // deep-link back to the candidate's tracking page
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Private helpers ──────────────────────────────────────────────────────

  private get replyTo(): string {
    return this.configService.get<string>('mail.replyTo') ?? 'support@fjob.vn';
  }

  private get from(): string {
    return this.configService.get<string>('mail.from') ?? 'F-Job <noreply@fjob.vn>';
  }

  // ─── Event 1 email: Employer receives new application alert ──────────────

  /**
   * Dispatches an HTML notification email to the Employer informing them
   * that a Candidate has just applied to one of their casual job vacancies.
   *
   * From:    Unified F-Job SMTP account (SMTP_FROM)
   * ReplyTo: support@fjob.vn (SMTP_REPLY_TO) — replies are routed to support
   *
   * @param to   Employer's registered email address.
   * @param data Template variable payload.
   */
  async sendApplicationReceivedEmail(
    to:   string,
    data: ApplicationReceivedEmailData,
  ): Promise<void> {
    const subject = `[F-Job] Ứng viên mới cho "${data.jobTitle}"`;

    const statusTag = `<span class="tag">Ứng tuyển mới</span>`;

    const bodyHtml = `
      <h2>Xin chào ${data.employerName || 'Nhà tuyển dụng'}!</h2>
      <p>Bạn vừa nhận được một ứng tuyển mới trên <strong>F-Job</strong>.</p>
      <hr class="divider" />
      <p><strong>Ứng viên:</strong> ${data.candidateFullName}</p>
      <p><strong>Vị trí ứng tuyển:</strong> ${data.jobTitle} &nbsp;${statusTag}</p>
      <p><strong>Công ty:</strong> ${data.companyName}</p>
      <hr class="divider" />
      <p>Nhấn nút bên dưới để xem chi tiết hồ sơ và thực hiện phân loại ứng viên:</p>
      <a href="${data.applicationUrl}" class="cta">Xem Hồ Sơ Ứng Viên →</a>
    `;

    await this.mailerService.sendMail({
      to,
      from:    this.from,
      replyTo: this.replyTo,
      subject,
      html:    wrapHtml(subject, bodyHtml),
    });

    this.logger.log(`[MailService] application.received → sent to ${to} (job: "${data.jobTitle}")`);
  }

  // ─── Event 2 email: Candidate receives status update alert ───────────────

  /**
   * Dispatches an HTML notification email to the Candidate informing them
   * of a recruitment pipeline status transition (Accepted / Rejected /
   * Scheduled / etc.) triggered by the Employer.
   *
   * From:    Unified F-Job SMTP account (SMTP_FROM)
   * ReplyTo: support@fjob.vn (SMTP_REPLY_TO)
   *
   * @param to   Candidate's registered email address.
   * @param data Template variable payload.
   */
  async sendApplicationStatusEmail(
    to:   string,
    data: ApplicationStatusEmailData,
  ): Promise<void> {
    const subject = `[F-Job] Cập nhật ứng tuyển: ${data.newStatus} — "${data.jobTitle}"`;

    // Pick tag colour based on outcome
    const tagClass =
      data.newStatus === 'Accepted'  ? 'green'  :
      data.newStatus === 'Rejected'  ? 'red'    :
      data.newStatus === 'Scheduled' ? 'orange' : '';

    const statusTag    = `<span class="tag ${tagClass}">${data.newStatus}</span>`;
    const noteSection  = data.employerNote
      ? `<p><strong>Ghi chú từ nhà tuyển dụng:</strong><br /><em>${data.employerNote}</em></p><hr class="divider" />`
      : '';

    const bodyHtml = `
      <h2>Xin chào ${data.candidateFullName}!</h2>
      <p>Trạng thái ứng tuyển của bạn đã được cập nhật.</p>
      <hr class="divider" />
      <p><strong>Vị trí:</strong> ${data.jobTitle} tại <strong>${data.companyName}</strong></p>
      <p><strong>Trạng thái mới:</strong> ${statusTag}</p>
      <hr class="divider" />
      ${noteSection}
      <p>Nhấn nút bên dưới để xem toàn bộ trạng thái ứng tuyển của bạn:</p>
      <a href="${data.applicationUrl}" class="cta">Xem Chi Tiết Ứng Tuyển →</a>
    `;

    await this.mailerService.sendMail({
      to,
      from:    this.from,
      replyTo: this.replyTo,
      subject,
      html:    wrapHtml(subject, bodyHtml),
    });

    this.logger.log(`[MailService] application.status_updated → sent to ${to} (status: ${data.newStatus})`);
  }
}
