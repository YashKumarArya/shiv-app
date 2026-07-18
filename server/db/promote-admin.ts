// Explicit compatibility command for an active user imported from schema.sql.
// It is intentionally separate from recurring migrations and normal startup.
import { pool } from '../src/config/db.js';
import { promoteLegacyBootstrapAdmin } from '../src/config/bootstrap.js';

try {
  const email = await promoteLegacyBootstrapAdmin();
  console.log(`Legacy user promoted to administrator: ${email}`);
} finally {
  await pool.end();
}
