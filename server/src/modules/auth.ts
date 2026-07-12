import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query, queryOne } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const passwordSchema = z.object({ current_password: z.string().min(1), new_password: z.string().min(6) });

const publicUser = ({ id, name, email, phone, role }: Record<string, unknown>) => ({ id, name, email, phone, role });

const router = Router();

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const user = await queryOne(`SELECT * FROM app_users WHERE email = $1 AND status = TRUE`, [req.body.email]);
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
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
