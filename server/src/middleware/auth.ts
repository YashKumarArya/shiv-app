import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { queryOne } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http.js';

export type Role = 'admin' | 'staff' | 'supervisor' | 'guard';

/** Roles that work in the office app and may read across the whole agency. */
export const OFFICE_ROLES = ['admin', 'staff'] as const;
/** Roles bound to one employee row, who may only ever read their own record. */
export const FIELD_ROLES = ['supervisor', 'guard'] as const;

export interface AuthUser {
  id: number;
  role: Role;
  /**
   * The employee this login belongs to, for field roles only. Every self-scoped
   * query keys off this column, never off a client-supplied id. The database
   * guarantees it is non-null exactly for supervisor and guard.
   */
  employee_id: number | null;
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
    `SELECT id, role, employee_id FROM app_users WHERE id = $1 AND status = TRUE`,
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

/**
 * Guards the agency-wide resources. Every existing module lists or edits data
 * across all employees, so a field login reaching one would expose the whole
 * workforce's salaries and Aadhaar numbers. Field roles are denied here by
 * default and get their own explicitly self-scoped endpoints instead.
 */
export const requireOffice = (req: Request, _res: Response, next: NextFunction) =>
  OFFICE_ROLES.includes(req.user?.role as (typeof OFFICE_ROLES)[number])
    ? next()
    : next(new HttpError(403, 'Office access required'));

/**
 * Resolves the employee a field login may act as. Throws rather than returning
 * null so no caller can accidentally continue with an unscoped query.
 */
export const actingEmployeeId = (req: Request): number => {
  const { role, employee_id: employeeId } = req.user ?? {};
  if (!FIELD_ROLES.includes(role as (typeof FIELD_ROLES)[number]) || !employeeId) {
    throw new HttpError(403, 'This endpoint is only for guard and supervisor logins');
  }
  return employeeId;
};

export const requireField = (req: Request, _res: Response, next: NextFunction) => {
  try {
    actingEmployeeId(req);
    next();
  } catch (error) {
    next(error);
  }
};
