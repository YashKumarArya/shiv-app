import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTransaction, type DbExecutor } from './db.js';
import { getMigrationStatus } from './migrations.js';

const adminEmailSchema = z.string().trim().toLowerCase().email().max(150);

const adminBootstrapCredentials = () => {
  const parsedEmail = adminEmailSchema.safeParse(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (!parsedEmail.success || !password) {
    throw new Error('A valid ADMIN_EMAIL and ADMIN_PASSWORD are required to bootstrap an administrator');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be at most 72 UTF-8 bytes for bcrypt');
  }
  return { email: parsedEmail.data, password };
};

const lockAdminBootstrap = (tx: DbExecutor) =>
  tx.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
    'shivapp',
    'first_admin',
  ]);

/**
 * Verifies migration history before the HTTP server binds a port.
 * Production DDL/backfills are an explicit release step (`npm run db:migrate`),
 * never work performed while the HTTP process is starting.
 */
export const initDb = async () => {
  const pending = (await getMigrationStatus()).filter((migration) => migration.state === 'pending');
  if (pending.length > 0) {
    throw new Error(
      `Database has ${pending.length} pending migration(s): ${pending.map((migration) => migration.fileName).join(', ')}. Run npm run db:migrate before starting the API`,
    );
  }
};

/**
 * Creates the first admin only from the explicit db:setup command.
 * Existing accounts are never promoted, reactivated, or assigned a new password
 * implicitly; account recovery is a separate, deliberate operator action.
 */
export const ensureAdmin = async () =>
  withTransaction(async (tx) => {
    // A separate transaction lock prevents two freshly-started instances from
    // racing after the migration lock has been released.
    await lockAdminBootstrap(tx);

    const existing = await tx.queryOne<{ email: string }>(
      `SELECT email FROM app_users WHERE role = 'admin' AND status = TRUE ORDER BY id LIMIT 1`,
    );
    if (existing) return existing.email;

    const { email, password } = adminBootstrapCredentials();

    const configuredUser = await tx.queryOne<{ id: number; role: string; status: boolean }>(
      `SELECT id, role, status FROM app_users WHERE LOWER(email) = $1 FOR UPDATE`,
      [email],
    );
    if (configuredUser) {
      throw new Error(
        configuredUser.status
          ? `ADMIN_EMAIL belongs to an existing ${configuredUser.role} account; db:setup will not promote or reset it`
          : 'ADMIN_EMAIL belongs to an inactive account; db:setup will not reactivate or reset it',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await tx.query(
      `INSERT INTO app_users (name, email, password_hash, role)
       VALUES ('Admin', $1, $2, 'admin')`,
      [email, passwordHash],
    );
    return email;
  });

/**
 * Explicit one-time compatibility path for a legacy root-schema database whose
 * users became staff when roles were introduced. It will never reactivate a
 * disabled account and refuses to run once any active administrator exists.
 */
export const promoteLegacyBootstrapAdmin = async () =>
  withTransaction(async (tx) => {
    await lockAdminBootstrap(tx);

    const existingAdmin = await tx.queryOne<{ id: number }>(
      `SELECT id FROM app_users WHERE role = 'admin' AND status = TRUE LIMIT 1`,
    );
    if (existingAdmin) {
      throw new Error('An active administrator already exists; manage roles through the application');
    }

    const { email, password } = adminBootstrapCredentials();
    const user = await tx.queryOne<{ id: number; status: boolean; role: string }>(
      `SELECT id, status, role FROM app_users WHERE LOWER(email) = $1 FOR UPDATE`,
      [email],
    );
    if (!user) {
      throw new Error('ADMIN_EMAIL does not match an existing legacy user; use db:setup with a new email instead');
    }
    if (!user.status) {
      throw new Error('The matching legacy user is inactive and will not be reactivated automatically');
    }
    if (user.role !== 'staff') {
      throw new Error(`The matching legacy user has unsupported role "${user.role}"`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await tx.query(
      `UPDATE app_users
       SET role = 'admin', password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, user.id],
    );
    return email;
  });
