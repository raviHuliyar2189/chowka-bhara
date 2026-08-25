import type { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import {
  roll,
  selectPoolValue,
  selectPiece,
  formGattiMove,
  rollbackLastMove,
  moverOfLastMove,
} from '@chowka/game-core/turnEngine';
import type { GameState } from '@chowka/game-core/turnEngine';
import type { SessionPayload } from '../auth/tokens';
import { lobbyRoom } from './io';
import { recordGameFinished } from '../games/stats';

interface GameRow {
  status: string;
  state: GameState | null;
}

export async function loadGame(gameId: string): Promise<GameRow | null> {
  const { rows } = await pool.query('select status, state from games where id = $1', [gameId]);
  return rows[0] ?? null;
}

export async function seatFor(gameId: string, playerId: string): Promise<string | null> {
  const { rows } = await pool.query('select seat from game_seats where game_id = $1 and player_id = $2', [
    gameId,
    playerId,
  ]);
  return rows[0]?.seat ?? null;
}

type Mutator = (state: GameState) => GameState;

// Loads the current state, applies one game-core reducer call, persists the result, updates
// stats if the game just ended, and broadcasts the new state to everyone in the room — the same
// shape for every gameplay action below (and reused by abort.ts's forfeit path), so each just
// supplies its own validation + reducer call.
export async function applyAndBroadcast(io: Server, gameId: string, mutate: Mutator): Promise<void> {
  const row = await loadGame(gameId);
  if (!row || !row.state || row.status !== 'in_progress') return;

  const next = mutate(row.state);
  if (next === row.state) return; // mutator declined (not this player's turn, illegal action, etc.)

  const justFinished = next.phase === 'game-over';
  await pool.query('update games set state = $1, status = $2 where id = $3', [
    JSON.stringify(next),
    justFinished ? 'finished' : 'in_progress',
    gameId,
  ]);
  if (justFinished) await recordGameFinished(gameId, next);

  io.to(lobbyRoom(gameId)).emit('game-updated', next);
}

export function registerGameplayHandlers(io: Server, socket: Socket, session: SessionPayload): void {
  socket.on('game:roll', async ({ gameId }: { gameId: string }) => {
    const seat = await seatFor(gameId, session.playerId);
    if (!seat) return;
    await applyAndBroadcast(io, gameId, (state) =>
      state.players[state.currentTurnIndex].id === seat ? roll(state) : state
    );
  });

  socket.on('game:select-value', async ({ gameId, index }: { gameId: string; index: number }) => {
    const seat = await seatFor(gameId, session.playerId);
    if (!seat) return;
    await applyAndBroadcast(io, gameId, (state) =>
      state.players[state.currentTurnIndex].id === seat ? selectPoolValue(state, index) : state
    );
  });

  socket.on('game:select-piece', async ({ gameId, pieceId }: { gameId: string; pieceId: number }) => {
    const seat = await seatFor(gameId, session.playerId);
    if (!seat) return;
    await applyAndBroadcast(io, gameId, (state) =>
      state.players[state.currentTurnIndex].id === seat ? selectPiece(state, pieceId) : state
    );
  });

  // Gatti-tollu requirement: bonds a tollu at `pos` into a permanent gatti using the currently
  // selected pool value — same validation shape as game:select-piece.
  socket.on('game:form-gatti', async ({ gameId, pos }: { gameId: string; pos: number }) => {
    const seat = await seatFor(gameId, session.playerId);
    if (!seat) return;
    await applyAndBroadcast(io, gameId, (state) =>
      state.players[state.currentTurnIndex].id === seat ? formGattiMove(state, pos) : state
    );
  });

  // Only the player who actually made the last move may undo it — not whoever the turn has
  // since passed to (see moverOfLastMove's own comment on why those can differ).
  socket.on('game:rollback', async ({ gameId }: { gameId: string }) => {
    const seat = await seatFor(gameId, session.playerId);
    if (!seat) return;
    await applyAndBroadcast(io, gameId, (state) => {
      const mover = moverOfLastMove(state);
      return mover && mover.id === seat ? rollbackLastMove(state) : state;
    });
  });
}
