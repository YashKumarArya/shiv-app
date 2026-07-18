import pg, { type PoolClient } from 'pg';
import { env } from './env.js';

// All CURRENT_DATE/date_trunc payroll boundaries use the agency's business day,
// not the database host's (often UTC) default. The startup option is applied by
// PostgreSQL before a pooled connection can execute its first query.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  options: `-c timezone=${env.businessTimeZone}`,
});

export interface DbExecutor {
  query: <T = any>(text: string, params?: unknown[]) => Promise<T[]>;
  queryOne: <T = any>(text: string, params?: unknown[]) => Promise<T | undefined>;
}

const executorFor = (client: Pick<PoolClient, 'query'>): DbExecutor => {
  const execute = async <T = any>(text: string, params?: unknown[]): Promise<T[]> => {
    const { rows } = await client.query(text, params);
    return rows;
  };

  return {
    query: execute,
    queryOne: async <T = any>(text: string, params?: unknown[]) =>
      (await execute<T>(text, params))[0],
  };
};

const poolExecutor = executorFor(pool);

export const query = poolExecutor.query;
export const queryOne = poolExecutor.queryOne;

/** Runs related reads and writes on one connection and rolls all of them back on failure. */
export const withTransaction = async <T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(executorFor(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
