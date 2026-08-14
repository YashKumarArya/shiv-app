import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { withTransaction, type DbExecutor } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { id } from '../lib/fields.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { parseInput } from '../lib/validation.js';
import { validate } from '../middleware/validate.js';
import { normalizePhone } from './auth.js';

// Field roles are deliberately absent: a guard or supervisor login must be
// bound to an employee, which this generic form has no way to express. Those
// accounts are created through /users/field-access instead.
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

const fieldAccessSchema = z.object({
  employee_id: id,
  role: z.enum(['guard', 'supervisor']).default('guard'),
  // Guards type this on a phone in the dark. Six digits is the realistic floor;
  // /auth/login throttles attempts so a short PIN stays defensible.
  pin: z.string().regex(/^\d{6,12}$/, 'must be 6 to 12 digits'),
});

const router = Router();

/**
 * Turns an employee into an app user. The phone number comes from the employee
 * record rather than the request, so the credential can never drift from the
 * person: changing who can sign in means editing the employee.
 */
router.post('/field-access', validate(fieldAccessSchema), asyncHandler(async (req, res) => {
  const { employee_id: employeeId, role, pin } = req.body as z.infer<typeof fieldAccessSchema>;

  const account = await withTransaction(async (tx) => {
    const employee = await tx.queryOne<{
      id: number; first_name: string; last_name: string | null; phone: string | null; status: string;
    }>(
      `SELECT id, first_name, last_name, phone, status FROM employees WHERE id = $1 FOR UPDATE`,
      [employeeId],
    );
    if (!employee) throw new HttpError(404, 'Employee not found');
    if (employee.status !== 'Active') {
      throw new HttpError(409, 'Only an active employee can be given app access');
    }

    const phone = normalizePhone(employee.phone ?? '');
    if (phone.length < 10) {
      throw new HttpError(409, 'Add a valid phone number to this employee before giving app access');
    }

    const existing = await tx.queryOne<{ id: number }>(
      `SELECT id FROM app_users WHERE employee_id = $1`,
      [employeeId],
    );
    if (existing) {
      throw new HttpError(409, 'This employee already has app access. Reset their PIN instead.');
    }

    const phoneTaken = await tx.queryOne<{ id: number }>(
      `SELECT id FROM app_users WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1`,
      [phone],
    );
    if (phoneTaken) throw new HttpError(409, 'Another account already uses this phone number');

    return tx.queryOne(
      `INSERT INTO app_users (name, phone, password_hash, role, employee_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, phone, role, employee_id, status`,
      [
        [employee.first_name, employee.last_name].filter(Boolean).join(' '),
        phone,
        await bcrypt.hash(pin, 10),
        role,
        employeeId,
      ],
    );
  });

  res.status(201).json(account);
}));

/** Resets a field PIN, for the daily reality of a guard who has forgotten it. */
router.post('/field-access/:employeeId/reset-pin', asyncHandler(async (req, res) => {
  const employeeId = parseInput(id, req.params.employeeId, 'employeeId');
  const { pin } = parseInput(fieldAccessSchema.pick({ pin: true }), req.body);

  const updated = await withTransaction(async (tx) => {
    const account = await tx.queryOne<{ id: number }>(
      `SELECT id FROM app_users WHERE employee_id = $1 FOR UPDATE`,
      [employeeId],
    );
    if (!account) throw new HttpError(404, 'This employee does not have app access');
    return tx.queryOne(
      `UPDATE app_users SET password_hash = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, name, phone, role, employee_id, status`,
      [await bcrypt.hash(pin, 10), account.id],
    );
  });

  res.json(updated);
}));

router.use(crudRouter({
  table: 'app_users',
  createSchema,
  updateSchema: createSchema.omit({ password: true }).partial(),
  searchColumns: ['name', 'email'],
  filterColumns: ['role', 'employee_id'],
  listQuery: 'SELECT id, name, email, phone, role, employee_id, status, created_at FROM app_users',
  returning: 'id, name, email, phone, role, employee_id, status',
  beforeCreate: async ({ password, ...rest }, _req, tx) => {
    await ensureUniqueEmail(String(rest.email), tx);
    return { ...rest, password_hash: await bcrypt.hash(password as string, 10) };
  },
  beforeUpdate: async (body, _req, userId, tx) => {
    await ensureAdminRemains(userId, body, tx);
    if (body.email !== undefined) await ensureUniqueEmail(String(body.email), tx, userId);
    // The generic form cannot express the employee binding a field role
    // requires, so it must not be able to promote or demote one either.
    if (body.role !== undefined) {
      const existing = await tx.queryOne<{ role: string }>(
        `SELECT role FROM app_users WHERE id = $1`,
        [userId],
      );
      if (existing && (existing.role === 'guard' || existing.role === 'supervisor')) {
        throw new HttpError(400, 'Change a field role through app access, not the user form');
      }
    }
    return body;
  },
  beforeDelete: (_req, userId, tx) => ensureAdminRemains(userId, null, tx),
}));

export default router;
