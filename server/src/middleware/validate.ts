import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { parseInput } from '../lib/validation.js';

export const validate =
  (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = parseInput(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
