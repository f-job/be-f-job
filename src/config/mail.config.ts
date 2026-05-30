import { registerAs } from '@nestjs/config';

/**
 * Mail configuration namespace.
 * Reads SMTP credentials from the environment and exposes them
 * under the 'mail' key for use in MailerModule.forRootAsync().
 */
export default registerAs('mail', () => ({
  host:    process.env.SMTP_HOST    || 'smtp.gmail.com',
  port:    parseInt(process.env.SMTP_PORT || '587', 10),
  user:    process.env.SMTP_USER    || '',
  pass:    process.env.SMTP_PASSWORD || '',
  from:    process.env.SMTP_FROM    || 'noreply@fjob.vn',
  replyTo: process.env.SMTP_REPLY_TO || 'support@fjob.vn',
}));
