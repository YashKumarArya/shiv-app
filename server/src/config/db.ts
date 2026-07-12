import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export const query = async <T = any>(text: string, params?: unknown[]): Promise<T[]> => {
  const { rows } = await pool.query(text, params);
  return rows;
};

export const queryOne = async <T = any>(text: string, params?: unknown[]): Promise<T | undefined> =>
  (await query<T>(text, params))[0];
