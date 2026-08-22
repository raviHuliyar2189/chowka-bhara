import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { pool } from './pool';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

async function main() {
  await pool.query(
    'create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())'
  );
  const { rows } = await pool.query('select name from _migrations');
  const applied = new Set<string>(rows.map((r) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying migration: ${file}`);
    await pool.query('begin');
    try {
      await pool.query(sql);
      await pool.query('insert into _migrations (name) values ($1)', [file]);
      await pool.query('commit');
    } catch (err) {
      await pool.query('rollback');
      throw err;
    }
  }

  console.log('Migrations up to date.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
