import { Router } from 'express';
import { pool } from '../db/pool';
import { readSession, requireAuth } from '../auth/middleware';
import { getIo, lobbyRoom } from '../realtime/io';
import { createGame, rematch, type GameState } from '@chowka/game-core/turnEngine';
import { PLAYER_COLORS, SEATS_BY_COUNT, AI_SEAT, AI_NAME, type PlayerId } from '@chowka/game-core/paths';
import { maybeScheduleAiTurn } from '../realtime/gameplay';
import { recordPlayerDeclined } from './stats';

export const gamesRouter = Router();
gamesRouter.use(readSession, requireAuth);

interface SeatRow {
  seat: string;
  player_id: string;
  status: string;
  joined_at: string | null;
  display_name: string;
  phone: string;
}

async function loadLobby(gameId: string) {
  const gameResult = await pool.query(
    `select g.id, g.status, g.created_by, g.seat_count, g.resign_allowed, g.state,
            p.display_name as created_by_name
     from games g join players p on p.id = g.created_by
     where g.id = $1`,
    [gameId]
  );
  const game = gameResult.rows[0] as
    | {
        id: string;
        status: string;
        created_by: string;
        created_by_name: string;
        seat_count: number;
        resign_allowed: boolean;
        state: unknown;
      }
    | undefined;
  if (!game) return null;

  const seatsResult = await pool.query(
    `select gs.seat, gs.player_id, gs.status, gs.joined_at, p.display_name, p.phone
     from game_seats gs join players p on p.id = gs.player_id
     where gs.game_id = $1
     order by gs.joined_at`,
    [gameId]
  );
  const seats = seatsResult.rows as SeatRow[];
  const joinedCount = seats.filter((s) => s.status === 'joined').length;

  return {
    id: game.id,
    status: game.status,
    createdBy: game.created_by,
    createdByName: game.created_by_name,
    seatCount: game.seat_count,
    resignAllowed: game.resign_allowed,
    // Present once the game has actually started — lets a participant who reopens the link
    // (closed tab, refreshed, switched devices) rejoin straight into the live board instead of
    // a waiting room that's already moved on.
    state: game.state ?? null,
    seats: seats.map((s) => ({
      seat: s.seat,
      playerId: s.player_id,
      displayName: s.display_name,
      phone: s.phone,
      status: s.status,
      joinedAt: s.joined_at,
    })),
    joinedCount,
    // At least 2 must actually join — the rest of the originally-planned seats can go unfilled
    // (declined or simply never responded); see /start below for how the final seat assignment
    // adapts to however many actually joined. A 1-player game is the one exception: it's always
    // just the creator (secretly playing against the AI — see /start), so there's no one else to
    // wait for.
    canStart: game.seat_count === 1 ? joinedCount >= 1 : joinedCount >= 2,
  };
}

async function broadcastLobbyUpdate(gameId: string) {
  const lobby = await loadLobby(gameId);
  if (lobby) getIo().to(lobbyRoom(gameId)).emit('lobby-updated', lobby);
}

// POST /games { seatCount: 1 | 2 | 3 | 4 } — creates a lobby with just the creator seated; the
// remaining seats are claimed (joined or declined) by whoever opens the game's shareable link
// next — see /join and /decline below. Who specifically gets that link is entirely up to the
// creator sharing it via WhatsApp; this app has no invitee list of its own. seatCount 1 is the one
// exception: no one else ever joins — see /start below for how it secretly becomes a 2-seat game
// against the AI once started.
gamesRouter.post('/games', async (req, res) => {
  const seatCount = Number(req.body?.seatCount);
  const seatOrder = SEATS_BY_COUNT[seatCount];
  if (!seatOrder) {
    res.status(400).json({ error: 'seatCount must be 1, 2, 3, or 4.' });
    return;
  }
  const resignAllowed = Boolean(req.body?.resignAllowed);

  const gameResult = await pool.query(
    'insert into games (created_by, seat_count, resign_allowed) values ($1, $2, $3) returning id',
    [req.player!.playerId, seatCount, resignAllowed]
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
// link-opener can see who's already in before deciding to join or decline.
gamesRouter.get('/games/:id', async (req, res) => {
  const lobby = await loadLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  res.json({ game: lobby });
});

// GET /games/:id/stats — every seated player's lifetime stats, keyed by seat ('P1'..'P4') rather
// than player id so the client can look a row up directly from GameState.players[].id with no
// extra name/id mapping. Restricted to this game's own participants (unlike the lobby GET above,
// which is deliberately open to any signed-in player) since stats are closer to personal data than
// "who's in this lobby." A player who has never finished a game has no player_stats row at all
// (only ever inserted by stats.ts's own upsert) — their seat is simply absent from the response,
// same "missing means EMPTY_STATS" convention StatsModal.tsx/ResultsModal.tsx already use for
// hotseat's localStorage-backed stats.
gamesRouter.get('/games/:id/stats', async (req, res) => {
  const gameId = req.params.id;
  const participant = await pool.query('select 1 from game_seats where game_id = $1 and player_id = $2', [
    gameId,
    req.player!.playerId,
  ]);
  if (participant.rows.length === 0) {
    res.status(403).json({ error: 'Not a participant in this game.' });
    return;
  }

  const { rows } = await pool.query(
    `select gs.seat, ps.games, ps.first, ps.second, ps.third, ps.losses, ps.resigned,
            ps.games_1p, ps.games_2p, ps.games_3p, ps.games_4p
     from game_seats gs
     join player_stats ps on ps.player_id = gs.player_id
     where gs.game_id = $1`,
    [gameId]
  );

  const stats: Record<string, unknown> = {};
  for (const row of rows) {
    stats[row.seat as string] = {
      games: row.games,
      first: row.first,
      second: row.second,
      third: row.third,
      losses: row.losses,
      resigned: row.resigned,
      games1p: row.games_1p,
      games2p: row.games_2p,
      games3p: row.games_3p,
      games4p: row.games_4p,
    };
  }
  res.json({ stats });
});

// Shared by /join and /decline — claims the next unfilled seat for the caller with the given
// status. Idempotent if already seated (in either state).
async function claimNextSeat(gameId: string, playerId: string, status: 'joined' | 'declined') {
  const gameResult = await pool.query('select seat_count from games where id = $1', [gameId]);
  const game = gameResult.rows[0] as { seat_count: number } | undefined;
  if (!game) return { error: 'not-found' as const };

  const existing = await pool.query('select seat from game_seats where game_id = $1 and player_id = $2', [
    gameId,
    playerId,
  ]);
  if (existing.rows.length === 0) {
    const takenResult = await pool.query('select seat from game_seats where game_id = $1', [gameId]);
    const taken = new Set(takenResult.rows.map((r) => r.seat as string));
    const seatOrder = SEATS_BY_COUNT[game.seat_count] ?? [];
    const nextSeat = seatOrder.find((s) => !taken.has(s));
    if (!nextSeat) return { error: 'full' as const };

    await pool.query(
      `insert into game_seats (game_id, seat, player_id, status, joined_at) values ($1, $2, $3, $4, now())`,
      [gameId, nextSeat, playerId, status]
    );
    if (status === 'declined') await recordPlayerDeclined(playerId);
    await broadcastLobbyUpdate(gameId);
  }
  return { error: null };
}

// POST /games/:id/join — claims the next open seat for the caller as 'joined'.
gamesRouter.post('/games/:id/join', async (req, res) => {
  const result = await claimNextSeat(req.params.id, req.player!.playerId, 'joined');
  if (result.error === 'not-found') {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  if (result.error === 'full') {
    res.status(400).json({ error: 'This game is already full.' });
    return;
  }
  res.json({ game: await loadLobby(req.params.id) });
});

// POST /games/:id/decline — claims the next open seat for the caller as 'declined'. Recorded in
// stats immediately (not deferred to game-end, since the game may never even start).
gamesRouter.post('/games/:id/decline', async (req, res) => {
  const result = await claimNextSeat(req.params.id, req.player!.playerId, 'declined');
  if (result.error === 'not-found') {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  if (result.error === 'full') {
    res.status(400).json({ error: 'This game is already full.' });
    return;
  }
  res.json({ game: await loadLobby(req.params.id) });
});

// POST /games/:id/abort-lobby — the creator alone may cancel the game while it's still in the
// lobby, no vote needed (unlike the in-game Abort flow, which requires every active player's
// agreement once play has actually started). Not recorded as a stats "abort" — the game never
// started, so it shouldn't count as a played game for anyone.
gamesRouter.post('/games/:id/abort-lobby', async (req, res) => {
  const gameId = req.params.id;
  const lobby = await loadLobby(gameId);
  if (!lobby) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  if (lobby.createdBy !== req.player!.playerId) {
    res.status(403).json({ error: 'Only the player who started this game can cancel it.' });
    return;
  }
  if (lobby.status !== 'lobby') {
    res.status(400).json({ error: 'This game has already started.' });
    return;
  }
  await pool.query("update games set status = 'aborted' where id = $1", [gameId]);
  await broadcastLobbyUpdate(gameId);
  res.status(204).end();
});

// POST /games/:id/start — only the player who created this game may start it, once at least 2
// have joined (mirrors abort-lobby's own creator-only restriction just above). Builds the initial
// GameState via @chowka/game-core's own createGame(), the exact same function the hotseat app
// uses, so the two never diverge in how a fresh game is set up.
//
// Seat assignment is finalized here, not at join/decline time, since it depends on the final
// joined count: joined players are re-seated onto the fair topology for that many players
// (SEATS_BY_COUNT[joinedCount] — e.g. opposite bases for 2), in their original join order, so
// active play is always balanced regardless of who declined. Declined players take whatever
// seat(s) are left over from the originally-planned topology (SEATS_BY_COUNT[seatCount]) after
// that reassignment — e.g. 4 planned, 1 declined -> the 3 who joined take P1/P2/P3, the decliner
// takes P4. This changes seat letters, so the game_seats rows are replaced wholesale (not
// updated in place) to avoid any composite-primary-key collision between the old and new letters.
gamesRouter.post('/games/:id/start', async (req, res) => {
  const gameId = req.params.id;
  const lobby = await loadLobby(gameId);
  if (!lobby) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  if (lobby.createdBy !== req.player!.playerId) {
    res.status(403).json({ error: 'Only the player who started this game can start it.' });
    return;
  }
  if (lobby.status !== 'lobby') {
    res.status(400).json({ error: 'This game has already started.' });
    return;
  }
  if (!lobby.canStart) {
    res.status(400).json({ error: 'Need at least 2 players to start.' });
    return;
  }

  const joined = lobby.seats.filter((s) => s.status === 'joined');
  const declined = lobby.seats.filter((s) => s.status === 'declined');
  const fairSeats = SEATS_BY_COUNT[joined.length]!;
  const leftoverSeats = SEATS_BY_COUNT[lobby.seatCount]!.filter((s) => !fairSeats.includes(s));

  const finalSeats = [
    ...joined.map((s, i) => ({ ...s, seat: fairSeats[i] })),
    ...declined.map((s, i) => ({ ...s, seat: leftoverSeats[i] })),
  ];

  await pool.query('begin');
  try {
    await pool.query('delete from game_seats where game_id = $1', [gameId]);
    for (const s of finalSeats) {
      await pool.query(
        `insert into game_seats (game_id, seat, player_id, status, joined_at)
         values ($1, $2, $3, $4, $5)`,
        [gameId, s.seat, s.playerId, s.status, s.joinedAt]
      );
    }
    await pool.query('commit');
  } catch (err) {
    await pool.query('rollback');
    throw err;
  }

  const playerDefs = finalSeats.map((s) => ({
    id: s.seat as PlayerId,
    name: s.displayName,
    color: PLAYER_COLORS[s.seat as PlayerId],
  }));
  // A 1-player game never had anyone else to invite — it secretly plays against the AI instead,
  // same seat/name the online server's own AI-driving code (gameplay.ts) and hotseat/Vs
  // Computer's client-driven AI use, so all three can never drift apart on what "the computer"
  // means. Deliberately NOT given a game_seats row: that absence is exactly how
  // maybeScheduleAiTurn (gameplay.ts) tells "this seat is AI-controlled" apart from a real player.
  if (lobby.seatCount === 1) {
    playerDefs.push({ id: AI_SEAT, name: AI_NAME, color: PLAYER_COLORS[AI_SEAT] });
  }
  const declinedLetters = new Set(finalSeats.filter((s) => s.status === 'declined').map((s) => s.seat));
  const freshState = createGame(playerDefs);
  const state = {
    ...freshState,
    players: freshState.players.map((p) => (declinedLetters.has(p.id) ? { ...p, hasLost: true, hasDeclined: true } : p)),
  };

  await pool.query('update games set status = $1, state = $2 where id = $3', [
    'in_progress',
    JSON.stringify(state),
    gameId,
  ]);
  getIo().to(lobbyRoom(gameId)).emit('game-updated', state);
  await maybeScheduleAiTurn(getIo(), gameId, state);

  res.json({ game: state });
});

// POST /games/:id/rematch — any participant may restart a finished OR fully-aborted game with
// the same seats, via @chowka/game-core's own rematch() (the same function hotseat's "play
// again"/vs-computer's "Play Again" use) so all three never diverge. A lobby-cancelled game is
// still never eligible: it's aborted before /start ever runs, so its `state` column is always
// null (the `!game.state` check below excludes it the same way it always has) — there's no board
// position to replay from. An in-game abort, by contrast, leaves `state` as the last live
// position (only `status` changes — see abort.ts), so a rematch from there is exactly as
// meaningful as one from a normal finish.
gamesRouter.post('/games/:id/rematch', async (req, res) => {
  const gameId = req.params.id;
  const gameResult = await pool.query('select status, state from games where id = $1', [gameId]);
  const game = gameResult.rows[0] as { status: string; state: GameState | null } | undefined;
  if (!game) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  const seatResult = await pool.query('select 1 from game_seats where game_id = $1 and player_id = $2', [
    gameId,
    req.player!.playerId,
  ]);
  if (seatResult.rows.length === 0) {
    res.status(403).json({ error: "You're not part of this game." });
    return;
  }
  if ((game.status !== 'finished' && game.status !== 'aborted') || !game.state) {
    res.status(400).json({ error: "This game hasn't finished yet." });
    return;
  }

  const next = rematch(game.state);
  await pool.query('update games set status = $1, state = $2 where id = $3', [
    'in_progress',
    JSON.stringify(next),
    gameId,
  ]);
  getIo().to(lobbyRoom(gameId)).emit('game-updated', next);
  await maybeScheduleAiTurn(getIo(), gameId, next);

  res.json({ game: next });
});
