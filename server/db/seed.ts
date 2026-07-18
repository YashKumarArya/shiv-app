// Applies ordered migrations and creates the first admin user. Run: npm run db:setup
// HTTP startup only verifies that this explicit setup/release step already ran.
import { pool } from '../src/config/db.js';
import { ensureAdmin } from '../src/config/bootstrap.js';
import { runMigrations } from '../src/config/migrations.js';

await runMigrations();
const email = await ensureAdmin();
console.log(`Database ready. Admin login: ${email}`);
await pool.end();
