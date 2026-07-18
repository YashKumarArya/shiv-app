import { pool } from '../src/config/db.js';
import { getMigrationStatus, runMigrations } from '../src/config/migrations.js';

const mode = process.argv[2] ?? 'up';

try {
  if (mode === '--status' || mode === '--check') {
    const status = await getMigrationStatus();
    for (const migration of status) {
      const applied = migration.state === 'applied' && migration.appliedAt
        ? `applied ${migration.appliedAt.toISOString()}`
        : 'pending';
      console.log(`${migration.fileName}: ${applied}`);
    }

    const pending = status.filter((migration) => migration.state === 'pending');
    if (mode === '--check' && pending.length > 0) {
      console.error(`${pending.length} database migration(s) are pending`);
      process.exitCode = 1;
    }
  } else if (mode === 'up') {
    const status = await runMigrations();
    const applied = status.filter((migration) => migration.state === 'applied').length;
    console.log(`Database is current (${applied} migration(s) applied)`);
  } else {
    throw new Error('Usage: tsx db/migrate.ts [up|--status|--check]');
  }
} finally {
  await pool.end();
}
