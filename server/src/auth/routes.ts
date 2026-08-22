import { Router } from 'express';
import { pool } from '../db/pool';
import { signSession } from './tokens';
import { readSession, requireAuth } from './middleware';

export const authRouter = Router();

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toSessionToken(player: { id: string; email: string; display_name: string }): string {
  return signSession({ playerId: player.id, email: player.email, displayName: player.display_name });
}

// POST /auth/login { email } — no password, no verification: the email alone identifies a
// returning player. 404 with status 'no-account' tells the client to offer sign-up instead.
authRouter.post('/login', async (req, res) => {
  const { email } = req.body ?? {};
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  const normalized = email.trim().toLowerCase();
  const { rows } = await pool.query('select id, email, display_name from players where email = $1', [
    normalized,
  ]);
  const player = rows[0] as { id: string; email: string; display_name: string } | undefined;
  if (!player) {
    res.status(404).json({ status: 'no-account', email: normalized });
    return;
  }
  res.json({
    status: 'logged-in',
    token: toSessionToken(player),
    player: { id: player.id, email: player.email, displayName: player.display_name },
  });
});

// POST /auth/signup { email, displayName } — creates the account and logs in immediately.
authRouter.post('/signup', async (req, res) => {
  const { email, displayName } = req.body ?? {};
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    res.status(400).json({ error: 'A display name is required.' });
    return;
  }
  const normalized = email.trim().toLowerCase();
  const name = displayName.trim().slice(0, 40);

  const existing = await pool.query('select id from players where email = $1', [normalized]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'An account with that email already exists — log in instead.' });
    return;
  }

  const { rows } = await pool.query(
    'insert into players (email, display_name) values ($1, $2) returning id, email, display_name',
    [normalized, name]
  );
  const player = rows[0] as { id: string; email: string; display_name: string };
  res.status(201).json({
    status: 'logged-in',
    token: toSessionToken(player),
    player: { id: player.id, email: player.email, displayName: player.display_name },
  });
});

authRouter.get('/me', readSession, requireAuth, (req, res) => {
  const { playerId, email, displayName } = req.player!;
  res.json({ player: { id: playerId, email, displayName } });
});
