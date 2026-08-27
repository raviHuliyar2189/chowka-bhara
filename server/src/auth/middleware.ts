import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionPayload } from './tokens';
import { pool } from '../db/pool';

declare global {
  namespace Express {
    interface Request {
      player?: SessionPayload;
    }
  }
}

// Bearer token in the Authorization header, not a cookie — the frontend and backend live on
// different domains (Vercel/Render), which makes a session cookie a third-party cookie that
// modern browsers block by default regardless of SameSite/Secure settings. A token the client
// attaches itself sidesteps that entirely.
function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

// Attaches req.player when a valid token is present; does not itself reject the request, so
// routes that work differently for signed-in vs anonymous callers can use it too.
export function readSession(req: Request, _res: Response, next: NextFunction): void {
  const token = readBearerToken(req);
  const session = token ? verifySession(token) : null;
  if (session) req.player = session;
  next();
}

// For routes that require a signed-in caller — must run after readSession. A validly-*signed*
// token only proves it was issued by this server at some point; it says nothing about whether
// that player still exists (an admin data reset, a GDPR deletion, anything that removes the
// row without also invalidating every token issued for it — signing is stateless by design, so
// there's no server-side session to revoke). Without this re-check, a client holding a stale
// token sails past this middleware, `req.player` looking perfectly valid, only to hit a foreign-
// key violation several steps later on whatever route actually touches the players table (e.g.
// games.created_by) — surfacing as an opaque generic 500 instead of an actionable "sign in
// again." Reproduced for real: a full players-table wipe left an already-open tab's create-game
// action failing exactly that way.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.player) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  const { rows } = await pool.query('select 1 from players where id = $1', [req.player.playerId]);
  if (rows.length === 0) {
    res.status(401).json({ error: 'Your account no longer exists. Please sign in again.' });
    return;
  }
  next();
}
