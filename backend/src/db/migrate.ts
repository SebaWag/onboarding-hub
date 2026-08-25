/**
 * Runner de migraciones minimalista para onboarding-hub.
 *
 * - Aplica los archivos .sql de src/db/migrations en orden lexicográfico.
 * - Registra cada migración aplicada en la tabla `_migrations`.
 * - Cada migración corre dentro de una transacción (all-or-nothing).
 *
 * Uso:
 *   npm run db:migrate          # aplica migraciones pendientes
 *   npm run db:migrate -- --status   # solo muestra estado
 */
import fs from 'fs';
import path from 'path';
import pool from './index';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(): Promise<Set<string>> {
  const result = await pool.query('SELECT name FROM _migrations ORDER BY name');
  return new Set(result.rows.map((r) => r.name));
}

function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function applyMigration(client: any, name: string, sql: string): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`✅ Aplicada: ${name}`);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw new Error(`Error aplicando ${name}: ${err.message}`);
  }
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes('--status');

  const files = getMigrationFiles();
  if (files.length === 0) {
    console.log('No hay archivos de migración.');
    return;
  }

  if (statusOnly) {
    const applied = await getApplied();
    for (const f of files) {
      console.log(`${applied.has(f) ? '✔ aplicada' : '○ pendiente'}  ${f}`);
    }
    return;
  }

  await ensureMigrationsTable();
  const applied = await getApplied();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Base de datos al día. Nada que aplicar.');
    return;
  }

  console.log(`Pendientes: ${pending.length} (${pending.join(', ')})`);

  const client = await pool.connect();
  try {
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await applyMigration(client, file, sql);
    }
    console.log('🎉 Migraciones completadas.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
