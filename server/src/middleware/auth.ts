import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
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

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    req.user = jwt.verify(token, env.jwtSecret) as AuthUser;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) =>
  req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Admin access required'));
