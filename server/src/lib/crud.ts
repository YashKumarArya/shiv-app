import { Router, type Request } from 'express';
import { z, type ZodSchema } from 'zod';
import { query, queryOne, withTransaction, type DbExecutor } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { id as idSchema, numericInput } from './fields.js';
import { asyncHandler, HttpError } from './http.js';
import { parseInput } from './validation.js';

type Body = Record<string, unknown>;

const paginationSchema = z.object({
  limit: numericInput(z.number().int().positive()).default(50).transform((value) => Math.min(value, 200)),
  offset: numericInput(z.number().int().nonnegative()).default(0),
});

const queryString = (value: unknown, name: string) => parseInput(z.string(), value, name);

export interface CrudConfig {
  table: string;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  /** Disable the generated POST route when a module provides a custom create workflow. */
  allowCreate?: boolean;
  /** Columns matched (ILIKE) against ?search= — qualify with table name when listQuery joins. */
  searchColumns?: string[];
  /** Columns allowed as exact-match query params, e.g. ?employee_id=3 */
  filterColumns?: string[];
  orderBy?: string;
  /** Custom SELECT (joins allowed, no WHERE clause). Defaults to SELECT * FROM table. */
  listQuery?: string;
  returning?: string;
  /** Transform/augment the validated body before INSERT (stamp user ids, hash passwords, …). */
  beforeCreate?: (body: Body, req: Request, tx: DbExecutor) => Body | Promise<Body>;
  beforeUpdate?: (body: Body, req: Request, id: number, tx: DbExecutor) => Body | Promise<Body>;
  beforeDelete?: (req: Request, id: number, tx: DbExecutor) => void | Promise<void>;
}

export const crudRouter = (config: CrudConfig) => {
  const {
    table, createSchema, updateSchema, searchColumns = [], filterColumns = [],
    orderBy = `${config.table}.id DESC`, listQuery, returning = '*', allowCreate = true,
    beforeCreate, beforeUpdate, beforeDelete,
  } = config;
  const select = listQuery ?? `SELECT * FROM ${table}`;
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const where: string[] = [];
    const params: unknown[] = [];

    if (req.query.search !== undefined && searchColumns.length) {
      const search = queryString(req.query.search, 'search');
      params.push(`%${search}%`);
      where.push(`(${searchColumns.map((col) => `${col} ILIKE $${params.length}`).join(' OR ')})`);
    }
    for (const col of filterColumns) {
      if (req.query[col] !== undefined) {
        params.push(queryString(req.query[col], col));
        where.push(`${table}.${col} = $${params.length}`);
      }
    }

    const { limit, offset } = parseInput(paginationSchema, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    params.push(limit, offset);
    const rows = await query(
      `${select}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(rows);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const recordId = parseInput(idSchema, req.params.id, 'id');
    const row = await queryOne(`${select} WHERE ${table}.id = $1`, [recordId]);
    if (!row) throw new HttpError(404, 'Record not found');
    res.json(row);
  }));

  if (allowCreate) {
    router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
      const row = await withTransaction(async (tx) => {
        const body = beforeCreate ? await beforeCreate(req.body, req, tx) : req.body;
        const keys = Object.keys(body);
        return tx.queryOne(
          `INSERT INTO ${table} (${keys.join(', ')})
           VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${returning}`,
          keys.map((key) => body[key]),
        );
      });
      res.status(201).json(row);
    }));
  }

  router.put('/:id', validate(updateSchema), asyncHandler(async (req, res) => {
    const recordId = parseInput(idSchema, req.params.id, 'id');
    const row = await withTransaction(async (tx) => {
      const body = beforeUpdate ? await beforeUpdate(req.body, req, recordId, tx) : req.body;
      const keys = Object.keys(body);
      if (!keys.length) throw new HttpError(400, 'No fields to update');
      return tx.queryOne(
        `UPDATE ${table} SET ${keys.map((key, i) => `${key} = $${i + 1}`).join(', ')}, updated_at = NOW()
         WHERE id = $${keys.length + 1} RETURNING ${returning}`,
        [...keys.map((key) => body[key]), recordId],
      );
    });
    if (!row) throw new HttpError(404, 'Record not found');
    res.json(row);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const recordId = parseInput(idSchema, req.params.id, 'id');
    const row = await withTransaction(async (tx) => {
      await beforeDelete?.(req, recordId, tx);
      return tx.queryOne(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [recordId]);
    });
    if (!row) throw new HttpError(404, 'Record not found');
    res.status(204).end();
  }));

  return router;
};
