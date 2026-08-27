import { Router } from 'express';
import { pool } from '../db/pool';
import { signSession } from './tokens';
import { readSession, requireAuth } from './middleware';

export const authRouter = Router();

// Accepts digits plus an optional leading '+' and common human formatting (spaces, dashes,
// parens) — normalized to digits-only for storage/lookup below, same idea as how the email flow
// this replaced normalized to lowercase. 7-15 digits covers real-world national numbers up to
// E.164's own 15-digit maximum, without being so strict it rejects a legitimate shorter number
// from a country that doesn't use as many digits.
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

function toSessionToken(player: { id: string; phone: string; display_name: string }): string {
  return signSession({ playerId: player.id, phone: player.phone, displayName: player.display_name });
}

// POST /auth/login { phone } — no password, no verification: the WhatsApp number alone
// identifies a returning player. 404 with status 'no-account' tells the client to offer sign-up
// instead.
authRouter.post('/login', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    res.status(400).json({ error: 'A valid WhatsApp number is required.' });
    return;
  }
  const { rows } = await pool.query('select id, phone, display_name from players where phone = $1', [phone]);
  const player = rows[0] as { id: string; phone: string; display_name: string } | undefined;
  if (!player) {
    res.status(404).json({ status: 'no-account', phone });
    return;
  }
  res.json({
    status: 'logged-in',
    token: toSessionToken(player),
    player: { id: player.id, phone: player.phone, displayName: player.display_name },
  });
});

// POST /auth/signup { phone, displayName } — creates the account and logs in immediately.
authRouter.post('/signup', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    res.status(400).json({ error: 'A valid WhatsApp number is required.' });
    return;
  }
  const { displayName } = req.body ?? {};
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    res.status(400).json({ error: 'A display name is required.' });
    return;
  }
  const name = displayName.trim().slice(0, 40);

  const existing = await pool.query('select id from players where phone = $1', [phone]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'An account with that WhatsApp number already exists — log in instead.' });
    return;
  }

  const { rows } = await pool.query(
    'insert into players (phone, display_name) values ($1, $2) returning id, phone, display_name',
    [phone, name]
  );
  const player = rows[0] as { id: string; phone: string; display_name: string };
  res.status(201).json({
    status: 'logged-in',
    token: toSessionToken(player),
    player: { id: player.id, phone: player.phone, displayName: player.display_name },
  });
});

authRouter.get('/me', readSession, requireAuth, (req, res) => {
  const { playerId, phone, displayName } = req.player!;
  res.json({ player: { id: playerId, phone, displayName } });
});
