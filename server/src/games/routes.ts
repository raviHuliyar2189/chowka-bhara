import { Router } from 'express';
import { pool } from '../db/pool';
import { readSession, requireAuth } from '../auth/middleware';
import { getIo, lobbyRoom } from '../realtime/io';
import { createGame } from '@chowka/game-core/turnEngine';
import { PLAYER_COLORS, SEATS_BY_COUNT, type PlayerId } from '@chowka/game-core/paths';

export const gamesRouter = Router();
gamesRouter.use(readSession, requireAuth);

interface SeatRow {
  seat: string;
  player_id: string;
  status: string;
  joined_at: string | null;
  display_name: string;
  email: string;
}

async function loadLobby(gameId: string) {
  const gameResult = await pool.query(
    'select id, status, created_by, seat_count, state from games where id = $1',
    [gameId]
  );
  const game = gameResult.rows[0] as
    | { id: string; status: string; created_by: string; seat_count: number; state: unknown }
    | undefined;
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
    seatCount: game.seat_count,
    // Present once the game has actually started — lets a participant who reopens the link
    // (closed tab, refreshed, switched devices) rejoin straight into the live board instead of
    // a waiting room that's already moved on.
    state: game.state ?? null,
    seats: seats.map((s) => ({
      seat: s.seat,
      playerId: s.player_id,
      displayName: s.display_name,
      email: s.email,
      status: s.status,
      joinedAt: s.joined_at,
    })),
    allJoined: seats.length === game.seat_count,
  };
}

async function broadcastLobbyUpdate(gameId: string) {
  const lobby = await loadLobby(gameId);
  if (lobby) getIo().to(lobbyRoom(gameId)).emit('lobby-updated', lobby);
}

// POST /games { seatCount: 2 | 3 | 4 } — creates a lobby with just the creator seated; the
// remaining seats are claimed by whoever opens the game's shareable link next (see /join below).
gamesRouter.post('/games', async (req, res) => {
  const seatCount = Number(req.body?.seatCount);
  const seatOrder = SEATS_BY_COUNT[seatCount];
  if (!seatOrder) {
    res.status(400).json({ error: 'seatCount must be 2, 3, or 4.' });
    return;
  }

  const gameResult = await pool.query(
    'insert into games (created_by, seat_count) values ($1, $2) returning id',
    [req.player!.playerId, seatCount]
  );
  const gameId = gameResult.rows[0].id as string;

  await pool.query(
    `insert into game_seats (game_id, seat, player_id, status, joined_at)
     values ($1, $2, $3, 'joined', now())`,
    [gameId, seatOrder[0], req.player!.playerId]
  );

  const lobby = await loadLobby(gameId);
  res.status(201).json({ game: lobby });
});

// GET /games/:id — viewable by any signed-in player, not just current participants, so a fresh
// link-opener can see who's already in before deciding to join.
gamesRouter.get('/games/:id', async (req, res) => {
  const lobby = await loadLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  res.json({ game: lobby });
});

// POST /games/:id/join — claims the next open seat for the caller. Idempotent if already seated.
gamesRouter.post('/games/:id/join', async (req, res) => {
  const gameId = req.params.id;
  const gameResult = await pool.query('select seat_count from games where id = $1', [gameId]);
  const game = gameResult.rows[0] as { seat_count: number } | undefined;
  if (!game) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  const existing = await pool.query('select seat from game_seats where game_id = $1 and player_id = $2', [
    gameId,
    req.player!.playerId,
  ]);
  if (existing.rows.length === 0) {
    const takenResult = await pool.query('select seat from game_seats where game_id = $1', [gameId]);
    const taken = new Set(takenResult.rows.map((r) => r.seat as string));
    const seatOrder = SEATS_BY_COUNT[game.seat_count] ?? [];
    const nextSeat = seatOrder.find((s) => !taken.has(s));
    if (!nextSeat) {
      res.status(400).json({ error: 'This game is already full.' });
      return;
    }
    await pool.query(
      `insert into game_seats (game_id, seat, player_id, status, joined_at)
       values ($1, $2, $3, 'joined', now())`,
      [gameId, nextSeat, req.player!.playerId]
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
