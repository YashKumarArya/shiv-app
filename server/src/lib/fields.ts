import { z } from 'zod';

/** Coerces numeric query/form strings without treating booleans or blanks as 1/0. */
export const numericInput = (
  schema: z.ZodType<number, z.ZodTypeDef, number>,
): z.ZodType<number, z.ZodTypeDef, unknown> => z.preprocess(
  (value) => typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  schema,
);

export const id = numericInput(z.number().int().positive());
export const money = numericInput(
  z.number()
    .finite()
    .nonnegative()
    .max(99_999_999.99)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      'must have at most two decimal places',
    ),
);

const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const isCalendarDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
};

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine(isCalendarDate, 'must be a valid calendar date');

export const monthString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= 1900 && year <= 2100;
  }, 'year must be between 1900 and 2100');

export const timeString = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'expected a valid 24-hour time (HH:MM)');
