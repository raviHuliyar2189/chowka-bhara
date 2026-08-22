import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env';

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export interface SessionPayload {
  playerId: string;
  email: string;
  displayName: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.sessionSecret, { expiresIn: '30d' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.sessionSecret) as SessionPayload;
  } catch {
    return null;
  }
}

interface PendingProfilePayload {
  email: string;
  pending: true;
}

// Issued once a magic link is confirmed for an email with no player row yet — proves the email
// was verified without logging the browser in yet, since a display name is still mandatory.
export function signPendingProfile(email: string): string {
  const payload: PendingProfilePayload = { email, pending: true };
  return jwt.sign(payload, env.sessionSecret, { expiresIn: '15m' });
}

export function verifyPendingProfile(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.sessionSecret) as PendingProfilePayload;
    return payload.pending ? payload.email : null;
  } catch {
    return null;
  }
}
