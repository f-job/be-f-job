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
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET is required.',
    'string.min': 'JWT_ACCESS_SECRET must be at least 32 characters for security.',
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
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  SMTP_FROM: Joi.string().email().optional(),
});
