import { z } from 'zod';

export const id = z.coerce.number().int().positive();
export const money = z.coerce.number().nonnegative();
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:MM');
