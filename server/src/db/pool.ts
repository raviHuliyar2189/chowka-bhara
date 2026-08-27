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

// Without this, an error on an *idle* pooled connection (e.g. Neon closing it server-side after
// its own idle timeout — normal, expected behavior for serverless Postgres, not a real outage)
// surfaces as an unhandled 'error' event on the Pool, which Node treats as fatal and crashes the
// entire process. `pg`'s own docs call this out explicitly. Node itself removes the now-dead
// client from the pool automatically; all this needs to do is stop that from being fatal — a
// future query just gets a fresh connection from the pool as normal. Reproduced locally: the
// server crashed outright mid-test with exactly this "Connection terminated unexpectedly" error,
// which would explain sporadic, unpredictable full-server outages (every connected player
// disconnected with no warning) in production, not just an isolated per-request failure.
pool.on('error', (err) => {
  console.error('Postgres pool: idle client error (connection recycled, server continues)', err);
});
