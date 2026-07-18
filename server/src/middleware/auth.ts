import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { queryOne } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http.js';

export interface AuthUser {
  id: number;
  role: 'admin' | 'staff';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const tokenPayload = z.object({ id: z.number().int().positive() });

const authenticate = async (req: Request) => {
  const match = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'Authentication required');

  let decoded: unknown;
  try {
    decoded = jwt.verify(match[1], env.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const parsed = tokenPayload.safeParse(decoded);
  if (!parsed.success) throw new HttpError(401, 'Invalid or expired token');

  // Do not trust a week-old role/status embedded in the JWT. Disabling a user
  // or changing their role must take effect on the very next API request.
  const user = await queryOne<AuthUser>(
    `SELECT id, role FROM app_users WHERE id = $1 AND status = TRUE`,
    [parsed.data.id],
  );
  if (!user) throw new HttpError(401, 'This account is no longer active');
  req.user = user;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  void authenticate(req).then(() => next(), next);
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) =>
  req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Admin access required'));
