// Applies the schema and seeds the first admin user. Run: npm run db:setup
import bcrypt from 'bcryptjs';
import fs from 'fs';
import { pool } from '../src/config/db.js';

const email = process.env.ADMIN_EMAIL ?? 'admin@agency.com';
const password = process.env.ADMIN_PASSWORD ?? 'admin123';

await pool.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
await pool.query(
  `INSERT INTO app_users (name, email, password_hash, role)
   VALUES ('Admin', $1, $2, 'admin') ON CONFLICT (email) DO NOTHING`,
  [email, await bcrypt.hash(password, 10)],
);

console.log(`Database ready. Admin login: ${email} / ${password}`);
await pool.end();
