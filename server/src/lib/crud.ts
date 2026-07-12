import { Router, type Request } from 'express';
import type { ZodSchema } from 'zod';
import { query, queryOne } from '../config/db.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from './http.js';

type Body = Record<string, unknown>;

export interface CrudConfig {
  table: string;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  /** Columns matched (ILIKE) against ?search= — qualify with table name when listQuery joins. */
  searchColumns?: string[];
  /** Columns allowed as exact-match query params, e.g. ?employee_id=3 */
  filterColumns?: string[];
  orderBy?: string;
  /** Custom SELECT (joins allowed, no WHERE clause). Defaults to SELECT * FROM table. */
  listQuery?: string;
  returning?: string;
  /** Transform/augment the validated body before INSERT (stamp user ids, hash passwords, …). */
  beforeCreate?: (body: Body, req: Request) => Body | Promise<Body>;
}

export const crudRouter = (config: CrudConfig) => {
  const {
    table, createSchema, updateSchema, searchColumns = [], filterColumns = [],
    orderBy = `${config.table}.id DESC`, listQuery, returning = '*', beforeCreate,
  } = config;
  const select = listQuery ?? `SELECT * FROM ${table}`;
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const where: string[] = [];
    const params: unknown[] = [];

    if (req.query.search && searchColumns.length) {
      params.push(`%${req.query.search}%`);
      where.push(`(${searchColumns.map((col) => `${col} ILIKE $${params.length}`).join(' OR ')})`);
    }
    for (const col of filterColumns) {
      if (req.query[col] !== undefined) {
        params.push(req.query[col]);
        where.push(`${table}.${col} = $${params.length}`);
      }
    }

    params.push(Math.min(Number(req.query.limit) || 50, 200), Number(req.query.offset) || 0);
    const rows = await query(
      `${select}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(rows);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const row = await queryOne(`${select} WHERE ${table}.id = $1`, [req.params.id]);
    if (!row) throw new HttpError(404, 'Record not found');
    res.json(row);
  }));

  router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
    const body = beforeCreate ? await beforeCreate(req.body, req) : req.body;
    const keys = Object.keys(body);
    const row = await queryOne(
      `INSERT INTO ${table} (${keys.join(', ')})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${returning}`,
      keys.map((key) => body[key]),
    );
    res.status(201).json(row);
  }));

  router.put('/:id', validate(updateSchema), asyncHandler(async (req, res) => {
    const keys = Object.keys(req.body);
    if (!keys.length) throw new HttpError(400, 'No fields to update');
    const row = await queryOne(
      `UPDATE ${table} SET ${keys.map((key, i) => `${key} = $${i + 1}`).join(', ')}, updated_at = NOW()
       WHERE id = $${keys.length + 1} RETURNING ${returning}`,
      [...keys.map((key) => req.body[key]), req.params.id],
    );
    if (!row) throw new HttpError(404, 'Record not found');
    res.json(row);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const row = await queryOne(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!row) throw new HttpError(404, 'Record not found');
    res.status(204).end();
  }));

  return router;
};
