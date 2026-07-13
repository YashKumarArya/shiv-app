// Applies the schema and seeds the first admin user. Run: npm run db:setup
// (The server also does this automatically at boot — see src/config/bootstrap.ts.)
import { pool } from '../src/config/db.js';
import { initDb } from '../src/config/bootstrap.js';

const email = await initDb();
console.log(`Database ready. Admin login: ${email}`);
await pool.end();
