import { z } from 'zod';

const blankToUndefined = (value: unknown) => (value === '' || value == null ? undefined : value);

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const optionalDate = dateString.or(z.literal('')).optional();
export const optionalTime = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM (24h)').or(z.literal('')).optional();
export const optionalText = z.string().optional();

export const requiredId = z.coerce.number().int().positive('Required');
export const optionalId = z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional());
const twoDecimalMoney = z.number().refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
  'Use at most 2 decimal places',
);
export const requiredMoney = z.coerce.number().positive('Enter a valid amount').pipe(twoDecimalMoney);
export const optionalMoney = z.preprocess(
  blankToUndefined,
  z.coerce.number().nonnegative().pipe(twoDecimalMoney).optional(),
);
