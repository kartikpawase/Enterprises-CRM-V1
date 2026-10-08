import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Deterministically search and load environment files
const envLocations = [
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'apps/api/.env'),
  path.resolve(process.cwd(), '.env.production'),
];

for (const p of envLocations) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10)),
  HOST: z.string().default('0.0.0.0'),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Database
  DATABASE_URL: z
    .string()
    .default('postgres://postgres:postgres@localhost:5432/sr_enterprises_crm'),
  DB_MAX_CONNECTIONS: z
    .string()
    .default(process.env.NODE_ENV === 'production' ? '5' : '10')
    .transform((val) => parseInt(val, 10)),
  DB_IDLE_TIMEOUT_MS: z
    .string()
    .default('30000')
    .transform((val) => parseInt(val, 10)),

  // Secondary Archive Database (Optional isolated PostgreSQL for historical archives)
  ARCHIVE_DATABASE_URL: z.string().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Security & Authentication
  COOKIE_SECRET: z
    .string()
    .min(16, 'COOKIE_SECRET must be at least 16 characters')
    .default('dev_cookie_secret_at_least_16_chars_long'),
  SESSION_SECRET: z
    .string()
    .min(16, 'SESSION_SECRET must be at least 16 characters')
    .default('dev_session_secret_at_least_16_chars_long'),
  SESSION_TTL_SECONDS: z
    .string()
    .default('86400')
    .transform((val) => parseInt(val, 10)),
  MAX_LOGIN_ATTEMPTS: z
    .string()
    .default('3')
    .transform((val) => parseInt(val, 10)),
  LOCKOUT_DURATION_MINUTES: z
    .string()
    .default('15')
    .transform((val) => parseInt(val, 10)),

  // Optional External Integrations
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  // Production CORS & Cross-Site Cookies
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional(),

  // WhatsApp Business Integration
  WHATSAPP_PROVIDER: z.enum(['META', 'DEV', 'MOCK']).default('META'),
  WHATSAPP_API_URL: z.string().default('https://graph.facebook.com'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('sr_enterprises_wa_verify_token'),
  WHATSAPP_WEBHOOK_APP_SECRET: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  // Transactional Email / PHPMailer (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('465'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.string().default('ssl'),
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().default('Enterprises CRM'),
  SUPPORT_EMAIL: z.string().default('support@enterprisescrm.local'),
  SUPPORT_PHONE: z.string().default(''),
  MAIL_DRIVER: z.string().optional(),
  MOCK_MAIL: z.string().optional(),

  // Google Maps Platform Integration
  MAP_ID: z.string().optional(),
  ROUTES_API_KEY: z.string().optional(),
  MAPS_JAVASCRIPT_API_KEY: z.string().optional(),
  GOOGLE_MAPS_SERVER_API_KEY: z.string().optional(),
  GOOGLE_MAPS_BROWSER_API_KEY: z.string().optional(),
  GOOGLE_MAPS_MAP_ID: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnv(customEnv?: Record<string, string | undefined>): EnvConfig {
  const raw = customEnv || process.env;
  const source = { ...raw };

  // Normalize DATABASE_URL across standard PostgreSQL variable names
  if (!source.DATABASE_URL && source.POSTGRES_URL) {
    source.DATABASE_URL = source.POSTGRES_URL;
  }

  // Normalize Google Maps Platform credentials from maps_credentials.md or standard names
  if (!source.GOOGLE_MAPS_SERVER_API_KEY && source.ROUTES_API_KEY) {
    source.GOOGLE_MAPS_SERVER_API_KEY = source.ROUTES_API_KEY;
  }
  if (!source.GOOGLE_MAPS_BROWSER_API_KEY && source.MAPS_JAVASCRIPT_API_KEY) {
    source.GOOGLE_MAPS_BROWSER_API_KEY = source.MAPS_JAVASCRIPT_API_KEY;
  }
  if (!source.GOOGLE_MAPS_MAP_ID && source.MAP_ID) {
    source.GOOGLE_MAPS_MAP_ID = source.MAP_ID;
  }

  const result = envSchema.safeParse(source);

  if (!result.success) {
    const errorIssues = result.error.issues
      .map((issue) => ` - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n');
    console.error(`\n❌ Critical Environment Configuration Error:\n${errorIssues}\n`);
    throw new Error(`Environment validation failed:\n${errorIssues}`);
  }

  return result.data;
}

export const env = parseEnv();
