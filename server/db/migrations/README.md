# Database migrations

Files in this directory are the production database history and the source of
truth for schema changes. They run in numeric order and are recorded in the
`schema_migrations` table with a SHA-256 checksum.

## Adding a change

1. Find the highest version and add the next file, for example
   `0008_add_employee_history.sql`.
2. Put forward-only SQL in that file. Include data backfills needed before new
   `NOT NULL`, foreign-key, check, or unique constraints.
3. Update `db/schema.sql` as a current-schema reference for database tools.
4. Test both a fresh database and a copy of the previous production schema.
5. Run `npm run db:migrate:status`, back up production, then run
   `npm run db:migrate` as the pre-deploy release command. HTTP startup only
   checks history and refuses to run with pending migrations.

Never rename, reorder, or edit a migration after it has been applied anywhere.
Create a new migration to correct it. The runner rejects checksum changes and
out-of-order additions.

Each file runs inside one transaction, so do not include `BEGIN`, `COMMIT`, or
commands PostgreSQL forbids in a transaction (notably `CREATE INDEX
CONCURRENTLY`). For a future large-table online migration, implement an explicit
multi-stage release instead of bypassing migration history.

The first migrations use `IF NOT EXISTS` because they onboard databases created
by the legacy `schema.sql`. They are still executed and recorded; the runner does
not blindly mark legacy databases as migrated.

## Pre-production draft databases

If a disposable local database applied a migration while that migration was
still being reviewed, recreate that local database and run `npm run db:setup`
after the files are frozen. Do not update `schema_migrations.checksum` merely to
silence the runner. For a development database whose data must be retained, take
a backup and reconcile the exact DDL/data delta with reviewed forward SQL before
changing its history row. This exception process is never valid for production;
an applied production migration is corrected only by a new numbered migration.
