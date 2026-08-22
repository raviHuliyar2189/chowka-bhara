import { Router } from 'express';
import { pool } from '../db/pool';
import { env } from '../env';
import { readSession, requireAuth } from '../auth/middleware';
import { sendGameInviteEmail } from '../email/sendGameInvite';
import { getIo, lobbyRoom } from '../realtime/io';
import { createGame } from '@chowka/game-core/turnEngine';
import { PLAYER_COLORS, type PlayerId } from '@chowka/game-core/paths';

export const gamesRouter = Router();
gamesRouter.use(readSession, requireAuth);

// The three valid seat combinations, matching the existing hotseat rules (app's SetupModal.tsx
// SEATS map) — 2-player games sit at opposite bases (P1/P3), not any arbitrary pair.
const VALID_SEAT_SETS = [
  ['P1', 'P3'],
  ['P1', 'P2', 'P3'],
  ['P1', 'P2', 'P3', 'P4'],
];

interface SeatRow {
  seat: string;
  player_id: string;
  status: string;
  joined_at: string | null;
  display_name: string;
  email: string;
}

async function loadLobby(gameId: string) {
  const gameResult = await pool.query('select id, status, created_by from games where id = $1', [gameId]);
  const game = gameResult.rows[0] as { id: string; status: string; created_by: string } | undefined;
  if (!game) return null;

  const seatsResult = await pool.query(
    `select gs.seat, gs.player_id, gs.status, gs.joined_at, p.display_name, p.email
     from game_seats gs join players p on p.id = gs.player_id
     where gs.game_id = $1
     order by gs.seat`,
    [gameId]
  );
  const seats = seatsResult.rows as SeatRow[];

  return {
    id: game.id,
    status: game.status,
    createdBy: game.created_by,
    seats: seats.map((s) => ({
      seat: s.seat,
      playerId: s.player_id,
      displayName: s.display_name,
      email: s.email,
      status: s.status,
      joinedAt: s.joined_at,
    })),
    allJoined: seats.length > 0 && seats.every((s) => s.status === 'joined'),
  };
}

async function broadcastLobbyUpdate(gameId: string) {
  const lobby = await loadLobby(gameId);
  if (lobby) getIo().to(lobbyRoom(gameId)).emit('lobby-updated', lobby);
}

// GET /players — the invite dropdown's data source: every registered player.
gamesRouter.get('/players', async (_req, res) => {
  const { rows } = await pool.query('select id, email, display_name from players order by display_name');
  res.json({
    players: rows.map((r) => ({ id: r.id, email: r.email, displayName: r.display_name })),
  });
});

// POST /games { seats: { P1: playerId, P2: playerId, ... } } — creates a lobby and emails
// invites to everyone except the organizer, who is auto-marked "joined" (they're already here).
gamesRouter.post('/games', async (req, res) => {
  const seatsInput = req.body?.seats;
  if (!seatsInput || typeof seatsInput !== 'object') {
    res.status(400).json({ error: 'seats is required.' });
    return;
  }

  const entries = Object.entries(seatsInput).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
  );
  const seatNames = entries.map(([seat]) => seat).sort();
  const seatSetValid = VALID_SEAT_SETS.some(
    (set) => set.length === seatNames.length && set.every((s, i) => s === seatNames[i])
  );
  if (!seatSetValid) {
    res.status(400).json({ error: 'Seats must be P1+P3, P1+P2+P3, or all four.' });
    return;
  }

  const playerIds = entries.map(([, id]) => id);
  if (new Set(playerIds).size !== playerIds.length) {
    res.status(400).json({ error: 'The same player cannot fill two seats.' });
    return;
  }
  if (!playerIds.includes(req.player!.playerId)) {
    res.status(400).json({ error: "You must include yourself as one of the seats you're setting up." });
    return;
  }

  const playersResult = await pool.query('select id, display_name, email from players where id = any($1)', [
    playerIds,
  ]);
  if (playersResult.rows.length !== playerIds.length) {
    res.status(400).json({ error: 'One or more selected players no longer exist.' });
    return;
  }
  const playerById = new Map(playersResult.rows.map((p) => [p.id as string, p]));

  const gameResult = await pool.query('insert into games (created_by) values ($1) returning id', [
    req.player!.playerId,
  ]);
  const gameId = gameResult.rows[0].id as string;

  for (const [seat, playerId] of entries) {
    const isOrganizer = playerId === req.player!.playerId;
    await pool.query(
      `insert into game_seats (game_id, seat, player_id, status, joined_at)
       values ($1, $2, $3, $4, $5)`,
      [gameId, seat, playerId, isOrganizer ? 'joined' : 'invited', isOrganizer ? new Date() : null]
    );
  }

  const inviteLink = `${env.appUrl}/games/${gameId}`;
  for (const [, playerId] of entries) {
    if (playerId === req.player!.playerId) continue;
    const invitee = playerById.get(playerId)!;
    await sendGameInviteEmail(invitee.email, req.player!.displayName, inviteLink);
  }

  const lobby = await loadLobby(gameId);
  res.status(201).json({ game: lobby });
});

// GET /games/:id — only participants may view a lobby.
gamesRouter.get('/games/:id', async (req, res) => {
  const lobby = await loadLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  if (!lobby.seats.some((s) => s.playerId === req.player!.playerId)) {
    res.status(403).json({ error: "You're not part of this game." });
    return;
  }
  res.json({ game: lobby });
});

// POST /games/:id/join — an invited player accepts their seat. Idempotent if already joined.
gamesRouter.post('/games/:id/join', async (req, res) => {
  const gameId = req.params.id;
  const seatResult = await pool.query(
    'select seat, status from game_seats where game_id = $1 and player_id = $2',
    [gameId, req.player!.playerId]
  );
  const seat = seatResult.rows[0] as { seat: string; status: string } | undefined;
  if (!seat) {
    res.status(403).json({ error: "You weren't invited to this game." });
    return;
  }
  if (seat.status !== 'joined') {
    await pool.query(
      'update game_seats set status = $1, joined_at = now() where game_id = $2 and seat = $3',
      ['joined', gameId, seat.seat]
    );
    await broadcastLobbyUpdate(gameId);
  }

  const lobby = await loadLobby(gameId);
  res.json({ game: lobby });
});

// POST /games/:id/start — any participant may start once everyone has joined; builds the
// initial GameState via @chowka/game-core's own createGame(), the exact same function the
// hotseat app uses, so the two never diverge in how a fresh game is set up.
gamesRouter.post('/games/:id/start', async (req, res) => {
  const gameId = req.params.id;
  const lobby = await loadLobby(gameId);
  if (!lobby) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  if (!lobby.seats.some((s) => s.playerId === req.player!.playerId)) {
    res.status(403).json({ error: "You're not part of this game." });
    return;
  }
  if (lobby.status !== 'lobby') {
    res.status(400).json({ error: 'This game has already started.' });
    return;
  }
  if (!lobby.allJoined) {
    res.status(400).json({ error: 'Not everyone has joined yet.' });
    return;
  }

  const playerDefs = lobby.seats.map((s) => ({
    id: s.seat as PlayerId,
    name: s.displayName,
    color: PLAYER_COLORS[s.seat as PlayerId],
  }));
  const state = createGame(playerDefs);

  await pool.query('update games set status = $1, state = $2 where id = $3', [
    'in_progress',
    JSON.stringify(state),
    gameId,
  ]);
  getIo().to(lobbyRoom(gameId)).emit('game-updated', state);

  res.json({ game: state });
});
