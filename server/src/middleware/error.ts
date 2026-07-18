import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from '../lib/http.js';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 10 MB or smaller' : 'Invalid file upload';
    return res.status(status).json({ error: message });
  }

  const requestError = err as Error & { status?: number; type?: string };
  if (requestError.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body contains invalid JSON' });
  }
  if (requestError.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }

  const pgCode = (err as { code?: string }).code;
  if (pgCode === '23505') return res.status(409).json({ error: 'A record with these details already exists' });
  if (pgCode === '55000') return res.status(409).json({ error: 'This financial record is immutable; create a reversal instead' });
  if (pgCode === 'P0001') return res.status(409).json({ error: err.message });
  if (pgCode === '23503') return res.status(400).json({ error: 'Record is referenced by other data or the reference does not exist' });
  if (['23502', '23514', '22001', '22003', '22P02'].includes(pgCode ?? '')) {
    return res.status(400).json({ error: 'The submitted data is invalid for this field' });
  }

  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
};
