import type { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import {
  roll,
  selectPoolValue,
  selectPiece,
  formGattiMove,
  rollbackLastMove,
  moverOfLastMove,
  checkStuckPool,
} from '@chowka/game-core/turnEngine';
import type { GameState } from '@chowka/game-core/turnEngine';
import { hasAnyLegalMove } from '@chowka/game-core/rules';
import { chooseAiMove } from '@chowka/game-core/ai';
import { AI_SEAT } from '@chowka/game-core/paths';
import type { SessionPayload } from '../auth/tokens';
import { lobbyRoom } from './io';
import { recordGameFinished } from '../games/stats';

// Same pacing as the client-driven AI's own delay (VsComputerPage.tsx/HotseatPage.tsx) — long
// enough that a spoken announcement has time to actually play before the next action fires.
const AI_MOVE_DELAY_MS = 2000;
// Same pacing as the client-driven modes' own stuck-pool delay (HotseatPage.tsx/
// VsComputerPage.tsx) — see maybeScheduleStuckPoolRevert below for why this mode needs its own
// server-side copy of that same held-then-revert behavior.
const STUCK_POOL_DELAY_MS = 2000;

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
// shape for every gameplay action below (and reused by resign.ts's forfeit path), so each just
// supplies its own validation + reducer call.
//
// getResignedNames is a thunk, not a plain array, because resign.ts doesn't know who (if anyone)
// actually resigned until its own mutator has run (it sets a closure variable inside that
// callback) — called here only after `mutate` returns, by which point that variable is populated.
// Every other caller just omits it (defaults to "nobody resigned").
export async function applyAndBroadcast(
  io: Server,
  gameId: string,
  mutate: Mutator,
  getResignedNames: () => string[] = () => []
): Promise<void> {
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
  if (justFinished) await recordGameFinished(gameId, next, getResignedNames());

  io.to(lobbyRoom(gameId)).emit('game-updated', next);

  if (!justFinished) {
    await maybeScheduleAiTurn(io, gameId, next);
    maybeScheduleStuckPoolRevert(io, gameId, next);
  }
}

// Same delayed-reveal behavior as the client-driven modes' own stuck-pool effect (see
// HotseatPage.tsx/VsComputerPage.tsx) — just server-side: game-core's roll()/selectPiece()/
// formGattiMove() no longer auto-revert a stuck pool inline (see checkStuckPool's own comment in
// turnEngine.ts), so this mode's server has to independently notice the same stuck condition and
// hold it for the same delay before actually reverting and broadcasting the result. Every
// connected client detects the same stuck condition off the state it already has and shows its
// own banner/announcement while waiting (see OnlinePlay.tsx) — this is only what actually performs
// and broadcasts the revert once the delay is up.
//
// Harmlessly races with maybeScheduleAiTurn when the AI itself is the one stuck (both get
// scheduled off the same roll/move): chooseAiMove already returns null with no legal move, so
// runAiTurn's own mutator is a no-op in that case — whichever of the two timers actually changes
// the state first "wins," the other just sees checkStuckPool decline against the now-already-
// reverted row and does nothing.
function maybeScheduleStuckPoolRevert(io: Server, gameId: string, state: GameState): void {
  if (state.phase !== 'awaiting-selection' || state.pool.length === 0) return;
  const player = state.players[state.currentTurnIndex];
  if (hasAnyLegalMove(state.players, player, state.pool)) return;

  setTimeout(() => {
    void applyAndBroadcast(io, gameId, (s) => checkStuckPool(s));
  }, STUCK_POOL_DELAY_MS);
}

// Online's "1 player" option (see games/routes.ts's /start) secretly plays against the same AI
// hotseat/Vs Computer use, but with no client ever connected for that seat — nothing would ever
// act on its behalf without this. Called after every state change (from here, and directly by
// /start and /rematch in routes.ts, which don't go through applyAndBroadcast) so a bonus-roll
// chain or a plain multi-value turn keeps the AI playing itself out, exactly like the client-driven
// version's effect re-firing on every state change.
//
// AI-controlled is determined by the *absence* of a game_seats row for AI_SEAT, not by name —
// matching on `id === AI_SEAT` alone would misfire if a real player ever legitimately held that
// seat (any ordinary 2+ player game) or coincidentally named themselves the same as AI_NAME.
export async function maybeScheduleAiTurn(io: Server, gameId: string, state: GameState): Promise<void> {
  const current = state.players[state.currentTurnIndex];
  if (current.id !== AI_SEAT) return;

  const { rows } = await pool.query('select 1 from game_seats where game_id = $1 and seat = $2', [gameId, AI_SEAT]);
  if (rows.length > 0) return; // a real player actually holds this seat

  setTimeout(() => {
    void runAiTurn(io, gameId);
  }, AI_MOVE_DELAY_MS);
}

async function runAiTurn(io: Server, gameId: string): Promise<void> {
  await applyAndBroadcast(io, gameId, (state) => {
    if (state.players[state.currentTurnIndex].id !== AI_SEAT) return state; // stale timer, no longer its turn
    if (state.phase === 'awaiting-roll') return roll(state);
    if (state.phase === 'awaiting-selection') {
      const move = chooseAiMove(state, AI_SEAT);
      if (!move) return state;
      const afterValue = selectPoolValue(state, move.poolIndex);
      return move.kind === 'move' ? selectPiece(afterValue, move.pieceId) : formGattiMove(afterValue, move.pos);
    }
    return state;
  });
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
