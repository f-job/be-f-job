import * as Joi from 'joi';

/**
 * Joi validation schema cho environment variables.
 * App sẽ fail fast và rõ ràng nếu thiếu bất kỳ biến bắt buộc nào.
 */
export const configValidationSchema = Joi.object({
  // ─── App ─────────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(4300),
  APP_NAME: Joi.string().default('F-Job'),
  SERVER_URL: Joi.string().uri().default('http://localhost:4300'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  // ─── MongoDB ──────────────────────────────────────────────────────────────
  MONGODB_URI: Joi.string().required().messages({
    'any.required': 'MONGODB_URI is required. Please set it in your .env file.',
    'string.empty': 'MONGODB_URI cannot be empty.',
  }),

  // ─── JWT ─────────────────────────────────────────────────────────────────
  JWT_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_SECRET is required.',
    'string.min': 'JWT_SECRET must be at least 32 characters for security.',
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_REFRESH_SECRET is required.',
    'string.min':
      'JWT_REFRESH_SECRET must be at least 32 characters for security.',
  }),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('7d'),

  // ─── Bcrypt ─────────────────────────────────────────────────────────────
  BCRYPT_SALT_ROUNDS: Joi.number().default(10),

  // ─── SMTP (optional in development) ──────────────────────────────────────
  SMTP_HOST: Joi.string().optional().allow(''),
  SMTP_PORT: Joi.number().optional().default(587),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASSWORD: Joi.string().optional().allow(''),
  // SMTP_FROM accepts both bare email ("noreply@fjob.vn") and RFC 5322
  // display-name format ("F-Job Notification <noreply@fjob.vn>").
  // Joi's strict .email() validator rejects the display-name form, so we
  // use a plain optional string and let nodemailer validate it at send-time.
  SMTP_FROM: Joi.string().optional().allow(''),
  // Reply-To address — same permissive rule as SMTP_FROM.
  SMTP_REPLY_TO: Joi.string().optional().allow('').default('support@fjob.vn'),

  // ─── OAuth ───────────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: Joi.string().required().messages({
    'any.required': 'GOOGLE_CLIENT_ID is required.',
    'string.empty': 'GOOGLE_CLIENT_ID cannot be empty.',
  }),
  GOOGLE_CLIENT_SECRET: Joi.string().required().messages({
    'any.required': 'GOOGLE_CLIENT_SECRET is required.',
    'string.empty': 'GOOGLE_CLIENT_SECRET cannot be empty.',
  }),
  FACEBOOK_APP_ID: Joi.string().required().messages({
    'any.required': 'FACEBOOK_APP_ID is required.',
    'string.empty': 'FACEBOOK_APP_ID cannot be empty.',
  }),
  FACEBOOK_APP_SECRET: Joi.string().required().messages({
    'any.required': 'FACEBOOK_APP_SECRET is required.',
    'string.empty': 'FACEBOOK_APP_SECRET cannot be empty.',
  }),
});
