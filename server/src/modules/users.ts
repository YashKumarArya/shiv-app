import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { DbExecutor } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { HttpError } from '../lib/http.js';

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().optional(),
  password: z.string().min(6),
  role: z.enum(['admin', 'staff']).default('staff'),
  status: z.boolean().optional(),
});

const ensureAdminRemains = async (
  userId: number,
  changes: Record<string, unknown> | null,
  tx: DbExecutor,
) => {
  // One shared transaction lock closes the race where two admins could each
  // appear non-final while being disabled/deleted at the same time.
  await tx.query(`SELECT pg_advisory_xact_lock(741852)`);
  const existing = await tx.queryOne<{ role: 'admin' | 'staff'; status: boolean }>(
    `SELECT role, status FROM app_users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  if (!existing) throw new HttpError(404, 'User not found');

  const remainsActiveAdmin = changes !== null
    && (changes.role ?? existing.role) === 'admin'
    && (changes.status ?? existing.status) === true;
  if (existing.role !== 'admin' || !existing.status || remainsActiveAdmin) return;

  const admins = await tx.queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM app_users WHERE role = 'admin' AND status = TRUE`,
  );
  if ((admins?.count ?? 0) <= 1) {
    throw new HttpError(409, 'The final active administrator cannot be disabled, demoted, or deleted');
  }
};

const ensureUniqueEmail = async (email: string, tx: DbExecutor, excludedId?: number) => {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [email]);
  const collision = await tx.queryOne<{ id: number }>(
    `SELECT id FROM app_users WHERE LOWER(email) = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
    [email, excludedId ?? null],
  );
  if (collision) throw new HttpError(409, 'A user with this email already exists');
};

export default crudRouter({
  table: 'app_users',
  createSchema,
  updateSchema: createSchema.omit({ password: true }).partial(),
  searchColumns: ['name', 'email'],
  listQuery: 'SELECT id, name, email, phone, role, status, created_at FROM app_users',
  returning: 'id, name, email, phone, role, status',
  beforeCreate: async ({ password, ...rest }, _req, tx) => {
    await ensureUniqueEmail(String(rest.email), tx);
    return { ...rest, password_hash: await bcrypt.hash(password as string, 10) };
  },
  beforeUpdate: async (body, _req, userId, tx) => {
    await ensureAdminRemains(userId, body, tx);
    if (body.email !== undefined) await ensureUniqueEmail(String(body.email), tx, userId);
    return body;
  },
  beforeDelete: (_req, userId, tx) => ensureAdminRemains(userId, null, tx),
});
