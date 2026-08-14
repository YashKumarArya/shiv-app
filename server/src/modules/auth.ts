import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query, queryOne } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

// Office staff sign in with email; guards and supervisors have no email address
// and sign in with the phone number already on their employee record.
const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().optional(),
    password: z.string().min(1).max(200),
  })
  .refine(
    (body) => (body.email === undefined) !== (body.phone === undefined),
    'Sign in with either an email address or a phone number',
  );

const passwordSchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(6).max(200),
});

const publicUser = ({ id, name, email, phone, role, employee_id }: Record<string, unknown>) =>
  ({ id, name, email, phone, role, employee_id: employee_id ?? null });

/** Stored and compared digits-only, so "98765 43210" and "9876543210" are one number. */
export const normalizePhone = (phone: string) => phone.replace(/\D/g, '');

/**
 * Guard PINs are short by necessity — they are typed on a phone at 3am, in the
 * dark, sometimes wearing gloves. Without a throttle a six-digit PIN is a few
 * hours of scripted guessing, so failures are counted per identifier and per
 * source address and locked out well before that becomes practical.
 *
 * In-memory on purpose: this API runs as a single process, and a restart
 * clearing the counters is an acceptable trade for having no new dependency.
 * Move this to Redis or the database before running more than one instance.
 */
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAt: number }>();

const throttleKey = (req: { ip?: string }, identifier: string) => `${req.ip ?? 'unknown'}|${identifier}`;

const assertNotLockedOut = (key: string) => {
  const record = attempts.get(key);
  if (!record) return;
  if (Date.now() - record.firstAt > LOCKOUT_MS) {
    attempts.delete(key);
    return;
  }
  if (record.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((LOCKOUT_MS - (Date.now() - record.firstAt)) / 60000);
    throw new HttpError(429, `Too many failed sign-in attempts. Try again in ${minutes} minute(s).`);
  }
};

const recordFailure = (key: string) => {
  const record = attempts.get(key);
  if (!record || Date.now() - record.firstAt > LOCKOUT_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  record.count += 1;
};

// Unbounded growth would be a slow memory leak on a long-running process.
setInterval(() => {
  const cutoff = Date.now() - LOCKOUT_MS;
  for (const [key, record] of attempts) if (record.firstAt < cutoff) attempts.delete(key);
}, LOCKOUT_MS).unref();

const router = Router();

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, phone, password } = req.body as {
    email?: string; phone?: string; password: string;
  };
  const identifier = email ?? normalizePhone(phone ?? '');
  const key = throttleKey(req, identifier);
  assertNotLockedOut(key);

  const user = email
    ? await queryOne(
        `SELECT * FROM app_users WHERE LOWER(email) = $1 AND status = TRUE`,
        [email],
      )
    : await queryOne(
        `SELECT * FROM app_users
         WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
           AND $1 <> ''
           AND status = TRUE`,
        [identifier],
      );

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    recordFailure(key);
    // One message for both branches: distinguishing them would confirm which
    // phone numbers and addresses have accounts.
    throw new HttpError(401, email ? 'Invalid email or password' : 'Invalid phone number or PIN');
  }

  attempts.delete(key);
  const token = jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await queryOne(`SELECT * FROM app_users WHERE id = $1`, [req.user!.id]);
  if (!user) throw new HttpError(404, 'User not found');
  res.json(publicUser(user));
}));

router.post('/change-password', requireAuth, validate(passwordSchema), asyncHandler(async (req, res) => {
  const user = await queryOne(`SELECT * FROM app_users WHERE id = $1`, [req.user!.id]);
  if (!user || !(await bcrypt.compare(req.body.current_password, user.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  const hash = await bcrypt.hash(req.body.new_password, 10);
  await query(`UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, req.user!.id]);
  res.json({ success: true });
}));

export default router;
