import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http.js';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const pgCode = (err as { code?: string }).code;
  if (pgCode === '23505') return res.status(409).json({ error: 'A record with these details already exists' });
  if (pgCode === '23503') return res.status(400).json({ error: 'Record is referenced by other data or the reference does not exist' });

  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
};
