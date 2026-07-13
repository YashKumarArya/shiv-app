import bcrypt from 'bcryptjs';
import fs from 'fs';
import { pool } from './db.js';

/**
 * Applies db/schema.sql (idempotent) and ensures the admin user exists.
 * Runs at every boot so fresh deploys need no manual DB setup.
 * ADMIN_EMAIL / ADMIN_PASSWORD are only used the first time (no overwrite).
 */
export const initDb = async () => {
  await pool.query(fs.readFileSync('db/schema.sql', 'utf8'));

  const email = process.env.ADMIN_EMAIL ?? 'admin@agency.com';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  await pool.query(
    `INSERT INTO app_users (name, email, password_hash, role)
     VALUES ('Admin', $1, $2, 'admin') ON CONFLICT (email) DO NOTHING`,
    [email, await bcrypt.hash(password, 10)],
  );
  return email;
};
