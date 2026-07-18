import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { pool } from './db.js';

const migrationsDirectory = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
const migrationFilePattern = /^(\d{4,})_([a-z][a-z0-9_]*)\.sql$/;
const migrationLockNamespace = 'shivapp';
const migrationLockName = 'schema_migrations';

interface MigrationFile {
  version: number;
  name: string;
  fileName: string;
  checksum: string;
  sql: string;
}

interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
  execution_time_ms: number;
}

export interface MigrationStatus {
  version: number;
  name: string;
  fileName: string;
  checksum: string;
  state: 'applied' | 'pending';
  appliedAt?: Date;
  executionTimeMs?: number;
}

const checksumFor = (contents: string) =>
  createHash('sha256').update(contents, 'utf8').digest('hex');

const loadMigrations = (): MigrationFile[] => {
  const sqlFiles = readdirSync(migrationsDirectory).filter((fileName) => fileName.endsWith('.sql'));
  const migrations = sqlFiles.map((fileName) => {
    const match = migrationFilePattern.exec(fileName);
    if (!match) {
      throw new Error(
        `Invalid migration filename "${fileName}". Expected NNNN_lowercase_name.sql`,
      );
    }

    const version = Number(match[1]);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error(`Invalid migration version in "${fileName}"`);
    }

    const sql = readFileSync(path.join(migrationsDirectory, fileName), 'utf8');
    if (!sql.trim()) throw new Error(`Migration "${fileName}" is empty`);

    return {
      version,
      name: match[2],
      fileName,
      checksum: checksumFor(sql),
      sql,
    };
  });

  migrations.sort((left, right) => left.version - right.version);
  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].version === migrations[index].version) {
      throw new Error(`Duplicate migration version ${migrations[index].version}`);
    }
    if (migrations[index - 1].name === migrations[index].name) {
      throw new Error(`Duplicate migration name "${migrations[index].name}"`);
    }
  }
  return migrations;
};

const createMigrationsTable = async (client: PoolClient) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version BIGINT PRIMARY KEY CHECK (version > 0),
      name TEXT NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL CHECK (length(checksum) = 64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INTEGER NOT NULL CHECK (execution_time_ms >= 0)
    )
  `);
};

const readAppliedMigrations = async (client: PoolClient): Promise<AppliedMigration[]> => {
  const result = await client.query<AppliedMigration>(`
    SELECT version, name, checksum, applied_at, execution_time_ms
    FROM schema_migrations
    ORDER BY version
  `);
  return result.rows;
};

const validateHistory = (migrations: MigrationFile[], applied: AppliedMigration[]) => {
  const localByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const appliedByVersion = new Map(applied.map((migration) => [Number(migration.version), migration]));
  const appliedByName = new Map(applied.map((migration) => [migration.name, migration]));
  const highestLocalVersion = migrations.at(-1)?.version ?? 0;

  for (const record of applied) {
    const local = localByVersion.get(Number(record.version));
    // A newer deployment may already have migrated the shared database while an
    // older instance is still starting. Only versions newer than this code are
    // safe to ignore; a missing older file means migration history was deleted.
    if (!local && Number(record.version) > highestLocalVersion) continue;
    if (!local) {
      throw new Error(
        `Applied migration ${record.version} (${record.name}) is missing from db/migrations`,
      );
    }
    if (local.name !== record.name) {
      throw new Error(
        `Migration ${record.version} was applied as "${record.name}" but is now named "${local.name}"`,
      );
    }
    if (local.checksum !== record.checksum.trim()) {
      throw new Error(
        `Migration ${local.fileName} was modified after it was applied. Add a new migration instead`,
      );
    }
  }

  for (const migration of migrations) {
    const sameName = appliedByName.get(migration.name);
    if (sameName && Number(sameName.version) !== migration.version) {
      throw new Error(
        `Migration name "${migration.name}" is already recorded as version ${sameName.version}`,
      );
    }
  }

  const highestAppliedVersion = applied.reduce(
    (highest, migration) => Math.max(highest, Number(migration.version)),
    0,
  );
  const outOfOrder = migrations.find(
    (migration) => !appliedByVersion.has(migration.version) && migration.version < highestAppliedVersion,
  );
  if (outOfOrder) {
    throw new Error(
      `Pending migration ${outOfOrder.fileName} is older than already-applied version ${highestAppliedVersion}`,
    );
  }
};

const buildStatus = (migrations: MigrationFile[], applied: AppliedMigration[]): MigrationStatus[] => {
  validateHistory(migrations, applied);
  const appliedByVersion = new Map(applied.map((migration) => [Number(migration.version), migration]));
  return migrations.map((migration) => {
    const record = appliedByVersion.get(migration.version);
    return {
      version: migration.version,
      name: migration.name,
      fileName: migration.fileName,
      checksum: migration.checksum,
      state: record ? 'applied' : 'pending',
      appliedAt: record?.applied_at,
      executionTimeMs: record?.execution_time_ms,
    };
  });
};

/**
 * Returns migration state without creating tables or taking locks. This is used
 * by deployment checks and is intentionally read-only.
 */
export const getMigrationStatus = async (): Promise<MigrationStatus[]> => {
  const migrations = loadMigrations();
  const client = await pool.connect();
  try {
    const exists = await client.query<{ exists: string | null }>(
      `SELECT to_regclass('schema_migrations')::text AS exists`,
    );
    if (!exists.rows[0]?.exists) return buildStatus(migrations, []);
    return buildStatus(migrations, await readAppliedMigrations(client));
  } finally {
    client.release();
  }
};

/**
 * Applies every pending SQL migration in order. A session advisory lock makes
 * this safe when multiple production instances start at the same time. Each
 * migration and its history row commit atomically.
 */
export const runMigrations = async (
  log: (message: string) => void = console.info,
): Promise<MigrationStatus[]> => {
  const migrations = loadMigrations();
  const client = await pool.connect();
  let lockHeld = false;

  try {
    await client.query(`SELECT pg_advisory_lock(hashtext($1), hashtext($2))`, [
      migrationLockNamespace,
      migrationLockName,
    ]);
    lockHeld = true;
    await createMigrationsTable(client);

    let applied = await readAppliedMigrations(client);
    validateHistory(migrations, applied);
    const appliedVersions = new Set(applied.map((migration) => Number(migration.version)));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;

      const startedAt = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        const executionTimeMs = Date.now() - startedAt;
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum, execution_time_ms)
           VALUES ($1, $2, $3, $4)`,
          [migration.version, migration.name, migration.checksum, executionTimeMs],
        );
        await client.query('COMMIT');
        log(`Applied database migration ${migration.fileName} (${executionTimeMs}ms)`);
        appliedVersions.add(migration.version);
      } catch (error) {
        await client.query('ROLLBACK');
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Database migration ${migration.fileName} failed: ${detail}`, {
          cause: error,
        });
      }
    }

    applied = await readAppliedMigrations(client);
    return buildStatus(migrations, applied);
  } finally {
    if (lockHeld) {
      await client
        .query(`SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`, [
          migrationLockNamespace,
          migrationLockName,
        ])
        .catch(() => undefined);
    }
    client.release();
  }
};
