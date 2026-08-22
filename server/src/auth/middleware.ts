import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionPayload } from './tokens';

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

// For routes that require a signed-in caller — must run after readSession.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.player) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  next();
}
