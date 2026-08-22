import { Pool } from 'pg';
import { env } from '../env';

// Neon (and most hosted Postgres) require TLS; `rejectUnauthorized: false` is the standard
// pragmatic setting for connecting without needing to source their CA bundle. Skipped for a
// plain local Postgres (localhost), which normally isn't running TLS at all.
const isLocal = env.databaseUrl.includes('localhost') || env.databaseUrl.includes('127.0.0.1');

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});
