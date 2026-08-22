import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionPayload } from './tokens';

export const SESSION_COOKIE = 'chowka_session';

declare global {
  namespace Express {
    interface Request {
      player?: SessionPayload;
    }
  }
}

// Attaches req.player when a valid session cookie is present; does not itself reject the
// request, so routes that work differently for signed-in vs anonymous callers can use it too.
export function readSession(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySession(token) : null;
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
