import type { output, ZodError, ZodTypeAny } from 'zod';
import { HttpError } from './http.js';

export const validationErrorMessage = (error: ZodError, root?: string) =>
  error.issues
    .map((issue) => {
      const path = [root, ...issue.path].filter(Boolean).join('.');
      return `${path ? `${path}: ` : ''}${issue.message}`;
    })
    .join('; ');

/** Parse request-derived input and consistently turn validation failures into HTTP 400 errors. */
export const parseInput = <Schema extends ZodTypeAny>(
  schema: Schema,
  input: unknown,
  root?: string,
): output<Schema> => {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, validationErrorMessage(result.error, root));
  return result.data;
};
