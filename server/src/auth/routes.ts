import { Router, type Response } from 'express';
import { pool } from '../db/pool';
import { env } from '../env';
import { sendMagicLinkEmail } from '../email/sendMagicLink';
import { newToken, signSession, signPendingProfile, verifyPendingProfile } from './tokens';
import { readSession, requireAuth, SESSION_COOKIE } from './middleware';

export const authRouter = Router();

const LINK_TTL_MINUTES = 15;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Player registration is intentionally NOT part of this same insert — the caller only reaches
// here once a magic link has already been confirmed for this email, so the identity is verified.
async function findPlayerByEmail(email: string) {
  const { rows } = await pool.query('select id, email, display_name from players where email = $1', [email]);
  return rows[0] as { id: string; email: string; display_name: string } | undefined;
}

function setSessionCookie(res: Response, player: { id: string; email: string; display_name: string }) {
  const token = signSession({ playerId: player.id, email: player.email, displayName: player.display_name });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

authRouter.post('/request-link', async (req, res) => {
  const { email } = req.body ?? {};
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  const normalized = email.trim().toLowerCase();
  const token = newToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000);
  await pool.query('insert into magic_links (token, email, expires_at) values ($1, $2, $3)', [
    token,
    normalized,
    expiresAt,
  ]);
  const link = `${env.appUrl}/auth/confirm?token=${token}`;
  await sendMagicLinkEmail(normalized, link);
  res.status(202).json({ status: 'sent' });
});

authRouter.get('/confirm', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).json({ error: 'Missing token.' });
    return;
  }

  const { rows } = await pool.query(
    'select email, expires_at, used_at from magic_links where token = $1',
    [token]
  );
  const link = rows[0] as { email: string; expires_at: string; used_at: string | null } | undefined;
  if (!link || link.used_at || new Date(link.expires_at) < new Date()) {
    res.status(400).json({ error: 'This link is invalid or has expired — request a new one.' });
    return;
  }
  await pool.query('update magic_links set used_at = now() where token = $1', [token]);

  const player = await findPlayerByEmail(link.email);
  if (!player) {
    // Email verified, but no account yet — mandatory display name still needed before login.
    const pendingToken = signPendingProfile(link.email);
    res.json({ status: 'needs-profile', email: link.email, pendingToken });
    return;
  }

  setSessionCookie(res, player);
  res.json({ status: 'logged-in', player: { id: player.id, email: player.email, displayName: player.display_name } });
});

authRouter.post('/complete-profile', async (req, res) => {
  const { pendingToken, displayName } = req.body ?? {};
  const email = typeof pendingToken === 'string' ? verifyPendingProfile(pendingToken) : null;
  if (!email) {
    res.status(400).json({ error: 'This registration link is invalid or has expired — request a new one.' });
    return;
  }
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    res.status(400).json({ error: 'A display name is required.' });
    return;
  }
  const name = displayName.trim().slice(0, 40);

  const { rows } = await pool.query(
    `insert into players (email, display_name) values ($1, $2)
     on conflict (email) do update set display_name = excluded.display_name
     returning id, email, display_name`,
    [email, name]
  );
  const player = rows[0] as { id: string; email: string; display_name: string };

  setSessionCookie(res, player);
  res.json({ status: 'logged-in', player: { id: player.id, email: player.email, displayName: player.display_name } });
});

authRouter.get('/me', readSession, requireAuth, (req, res) => {
  const { playerId, email, displayName } = req.player!;
  res.json({ player: { id: playerId, email, displayName } });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});
