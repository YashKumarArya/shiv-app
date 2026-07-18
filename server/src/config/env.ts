import 'dotenv/config';
import { z } from 'zod';

const timeZone = z.string().min(1).default('Asia/Kolkata').refine((value) => {
  if (!/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'must be a valid IANA time zone such as Asia/Kolkata');

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().min(1, 'is required'),
  JWT_SECRET: z.string().min(32, 'must contain at least 32 characters'),
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  BUSINESS_TIME_ZONE: timeZone,
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const message = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${message}`);
}

export const env = {
  port: result.data.PORT,
  databaseUrl: result.data.DATABASE_URL,
  jwtSecret: result.data.JWT_SECRET,
  uploadDir: result.data.UPLOAD_DIR,
  businessTimeZone: result.data.BUSINESS_TIME_ZONE,
};
