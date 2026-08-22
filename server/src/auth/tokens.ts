import jwt from 'jsonwebtoken';
import { env } from '../env';

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
