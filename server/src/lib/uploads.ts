import { createHmac, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';

const SIGNED_URL_TTL_SECONDS = 15 * 60;
const CLOCK_SKEW_SECONDS = 30;
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// New files use jpg/png/webp. The remaining suffixes (and no suffix) are
// historical names produced from the original client filename. Serving still
// verifies the actual bytes are a raster image before returning any content.
const legacyRasterExtensions = 'avif|bmp|gif|heic|heif|jfif|jpe|jpe?g|png|tiff?|webp';
const uploadPathPattern = new RegExp(`^/uploads/(${uuidPattern}(?:\\.(?:${legacyRasterExtensions}))?)$`, 'i');

/**
 * Convert either a stored upload reference or one of our expiring URLs back to
 * the stable value that belongs in the database. Absolute/external URLs,
 * encoded traversal, and non-UUID filenames are deliberately rejected. Legacy
 * UUID image names may have a historical raster suffix or no suffix at all.
 */
export const canonicalUploadPath = (value: string): string | null => {
  const pathname = value.split('?', 1)[0];
  return uploadPathPattern.test(pathname) ? pathname : null;
};

export const uploadFileName = (value: string): string | null =>
  canonicalUploadPath(value)?.match(uploadPathPattern)?.[1] ?? null;

/** A validated upload reference which is always stored without a signature. */
export const uploadReference = z.string().trim().transform((value, context) => {
  const canonical = canonicalUploadPath(value);
  if (!canonical) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'must be a valid uploaded file reference',
    });
    return z.NEVER;
  }
  return canonical;
});

const signatureFor = (canonicalPath: string, expires: number) =>
  createHmac('sha256', env.jwtSecret)
    .update(`${canonicalPath}\n${expires}`)
    .digest('base64url');

export const signedUploadPath = (value: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null => {
  const canonical = canonicalUploadPath(value);
  if (!canonical) return null;
  const expires = nowSeconds + SIGNED_URL_TTL_SECONDS;
  const signature = signatureFor(canonical, expires);
  return `${canonical}?expires=${expires}&signature=${signature}`;
};

export const isValidUploadSignature = (
  canonicalPath: string,
  expiresInput: unknown,
  signatureInput: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  if (typeof expiresInput !== 'string' || typeof signatureInput !== 'string') return false;
  if (!/^\d{10}$/.test(expiresInput)) return false;

  const expires = Number(expiresInput);
  if (expires < nowSeconds || expires > nowSeconds + SIGNED_URL_TTL_SECONDS + CLOCK_SKEW_SECONDS) return false;

  const expected = Buffer.from(signatureFor(canonicalPath, expires));
  const supplied = Buffer.from(signatureInput);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

const signUploadReferences = (value: unknown, nowSeconds: number): unknown => {
  if (typeof value === 'string') return signedUploadPath(value, nowSeconds) ?? value;
  if (Array.isArray(value)) return value.map((item) => signUploadReferences(item, nowSeconds));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, signUploadReferences(item, nowSeconds)]),
  );
};

/**
 * Authenticated JSON responses get short-lived links while database rows retain
 * canonical paths. One timestamp per response keeps duplicate references equal.
 */
export const signUploadResponsePaths = (_req: Request, res: Response, next: NextFunction) => {
  const json = res.json.bind(res);
  // Authenticated records (and their temporary file capabilities) must not be
  // retained by shared HTTP caches. React Query still provides in-app caching.
  res.set('Cache-Control', 'no-store');
  res.json = ((body: unknown) => json(signUploadReferences(body, Math.floor(Date.now() / 1000)))) as Response['json'];
  next();
};

export const uploadUrlTtlSeconds = SIGNED_URL_TTL_SECONDS;
