import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

export interface NewJobEmailData {
  jobId: string;
  title: string;
  companyName: string;
  location: string;
  district?: string;
  salaryAmount?: number;
  jobType?: string;
  industry?: string;
  employerEmail?: string;
  description?: string;
  createdAt: Date;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly adminEmail = 'admin.fjob@gmail.com';
  private readonly serverUrl: string;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    this.serverUrl = this.configService.get('app.serverUrl') || 'http://localhost:4300';
  }

  /**
   * Gửi email thông báo đến admin khi có bài đăng tuyển dụng mới
   */
  async sendNewJobNotificationToAdmin(jobData: NewJobEmailData): Promise<void> {
    try {
      const jobDetailUrl = `${this.serverUrl}/jobs/${jobData.jobId}`;
      
      const htmlContent = this.generateNewJobEmailTemplate(jobData, jobDetailUrl);

      await this.mailerService.sendMail({
        to: this.adminEmail,
        subject: `🆕 Bài đăng tuyển dụng mới: ${jobData.title} - ${jobData.companyName}`,
        html: htmlContent,
      });

      this.logger.log(`✅ Email thông báo job mới đã được gửi đến ${this.adminEmail} - Job ID: ${jobData.jobId}`);
    } catch (error) {
      this.logger.error(`❌ Lỗi khi gửi email thông báo job mới đến admin:`, error);
      // Không throw error để không ảnh hưởng đến flow tạo job
    }
  }

  /**
   * Tạo template HTML cho email thông báo job mới
   */
  private generateNewJobEmailTemplate(jobData: NewJobEmailData, jobDetailUrl: string): string {
    const formatCurrency = (amount?: number) => {
      if (!amount) return 'Thỏa thuận';
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      }).format(amount);
    };

    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(date);
    };

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thông báo bài đăng tuyển dụng mới</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                🆕 Bài đăng tuyển dụng mới
              </h1>
              <p style="margin: 10px 0 0; color: #f0f0f0; font-size: 14px;">
                Có một bài đăng tuyển dụng mới vừa được tạo trên F-Job
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              
              <!-- Job Title -->
              <h2 style="margin: 0 0 20px; color: #333; font-size: 20px; font-weight: 600;">
                ${jobData.title}
              </h2>

              <!-- Company Info -->
              <div style="margin-bottom: 25px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #667eea; border-radius: 4px;">
                <p style="margin: 0; color: #555; font-size: 16px;">
                  <strong>🏢 Công ty:</strong> ${jobData.companyName}
                </p>
              </div>

              <!-- Job Details -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef;">
                    <strong style="color: #666;">📍 Địa điểm:</strong>
                  </td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef; text-align: right; color: #333;">
                    ${jobData.location}${jobData.district ? `, ${jobData.district}` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef;">
                    <strong style="color: #666;">💰 Mức lương:</strong>
                  </td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef; text-align: right; color: #333;">
                    ${formatCurrency(jobData.salaryAmount)}
                  </td>
                </tr>
                ${jobData.jobType ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef;">
                    <strong style="color: #666;">📋 Loại công việc:</strong>
                  </td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef; text-align: right; color: #333;">
                    ${jobData.jobType}
                  </td>
                </tr>
                ` : ''}
                ${jobData.industry ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef;">
                    <strong style="color: #666;">🏭 Ngành nghề:</strong>
                  </td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef; text-align: right; color: #333;">
                    ${jobData.industry}
                  </td>
                </tr>
                ` : ''}
                ${jobData.employerEmail ? `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef;">
                    <strong style="color: #666;">📧 Email NTD:</strong>
                  </td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e9ecef; text-align: right; color: #333;">
                    ${jobData.employerEmail}
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 10px 0;">
                    <strong style="color: #666;">🕐 Thời gian tạo:</strong>
                  </td>
                  <td style="padding: 10px 0; text-align: right; color: #333;">
                    ${formatDate(jobData.createdAt)}
                  </td>
                </tr>
              </table>

              ${jobData.description ? `
              <!-- Description -->
              <div style="margin-bottom: 25px;">
                <h3 style="margin: 0 0 10px; color: #333; font-size: 16px; font-weight: 600;">
                  📝 Mô tả công việc:
                </h3>
                <div style="padding: 15px; background-color: #f8f9fa; border-radius: 4px; color: #555; font-size: 14px; line-height: 1.6;">
                  ${jobData.description.substring(0, 300)}${jobData.description.length > 300 ? '...' : ''}
                </div>
              </div>
              ` : ''}

              <!-- Action Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${jobDetailUrl}" 
                   style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">
                  👁️ Xem chi tiết bài đăng
                </a>
              </div>

              <!-- Job ID -->
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center;">
                <p style="margin: 0; color: #999; font-size: 12px;">
                  Job ID: <code style="background-color: #f8f9fa; padding: 2px 6px; border-radius: 3px; color: #667eea;">${jobData.jobId}</code>
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #666; font-size: 12px;">
                Email này được gửi tự động từ hệ thống F-Job
              </p>
              <p style="margin: 10px 0 0; color: #999; font-size: 12px;">
                © ${new Date().getFullYear()} F-Job - Nền tảng tuyển dụng việc làm linh hoạt
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }
}
