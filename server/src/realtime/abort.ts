import type { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import { removePlayers } from '@chowka/game-core/turnEngine';
import type { PlayerId } from '@chowka/game-core/paths';
import type { SessionPayload } from '../auth/tokens';
import { lobbyRoom } from './io';
import { loadGame, seatFor, applyAndBroadcast } from './gameplay';
import { recordGameAborted } from '../games/stats';

interface PendingAbort {
  requestedBy: PlayerId;
  activeSeats: PlayerId[]; // computed from the live GameState at request time
  votes: Map<PlayerId, boolean>; // seat -> agreed?
}

// Not persisted — votes are short-lived (seconds/minutes) and Render's free tier runs a single
// instance, so an in-memory map is enough; no schema change needed for the vote itself.
const pending = new Map<string, PendingAbort>();

function broadcastPending(io: Server, gameId: string): void {
  const p = pending.get(gameId);
  if (!p) return;
  io.to(lobbyRoom(gameId)).emit('abort:pending', {
    requestedBy: p.requestedBy,
    activeSeats: p.activeSeats,
    votes: Object.fromEntries(p.votes),
  });
}

async function checkResolution(io: Server, gameId: string): Promise<void> {
  const p = pending.get(gameId);
  if (!p || p.votes.size < p.activeSeats.length) return;

  const declines = p.activeSeats.filter((seat) => p.votes.get(seat) === false);

  if (declines.length === 0) {
    pending.delete(gameId);
    await pool.query("update games set status = 'aborted' where id = $1", [gameId]);
    await recordGameAborted(gameId);
    io.to(lobbyRoom(gameId)).emit('abort:resolved', { action: 'abort' });
    return;
  }

  if (declines.length === 1) {
    pending.delete(gameId);
    io.to(lobbyRoom(gameId)).emit('abort:resolved', { action: 'resume' });
    return;
  }

  // 2+ declines — mirrors hotseat's AbortModal follow-up ("forfeit the ones who agreed, or
  // resume?"), decided by whoever originally requested the abort since there's no single shared
  // modal to ask everyone at once online. Keep the pending entry alive until they decide.
  io.to(lobbyRoom(gameId)).emit('abort:forfeit-needed', {
    requestedBy: p.requestedBy,
    declineCount: declines.length,
  });
}

export function registerAbortHandlers(io: Server, socket: Socket, session: SessionPayload): void {
  socket.on('abort:request', async ({ gameId }: { gameId: string }) => {
    const seat = (await seatFor(gameId, session.playerId)) as PlayerId | null;
    if (!seat) return;
    const row = await loadGame(gameId);
    if (!row?.state || row.status !== 'in_progress') return;

    const activeSeats = row.state.players.filter((p) => !p.isFinished && !p.hasLost).map((p) => p.id);
    if (!activeSeats.includes(seat)) return;

    pending.set(gameId, { requestedBy: seat, activeSeats, votes: new Map([[seat, true]]) });
    broadcastPending(io, gameId);
    await checkResolution(io, gameId);
  });

  socket.on('abort:respond', async ({ gameId, agree }: { gameId: string; agree: boolean }) => {
    const seat = (await seatFor(gameId, session.playerId)) as PlayerId | null;
    if (!seat) return;
    const p = pending.get(gameId);
    if (!p || !p.activeSeats.includes(seat) || p.votes.has(seat)) return;

    p.votes.set(seat, agree);
    broadcastPending(io, gameId);
    await checkResolution(io, gameId);
  });

  socket.on('abort:forfeit-decision', async ({ gameId, forfeit }: { gameId: string; forfeit: boolean }) => {
    const seat = (await seatFor(gameId, session.playerId)) as PlayerId | null;
    const p = pending.get(gameId);
    if (!p || !seat || p.requestedBy !== seat) return;

    const declines = p.activeSeats.filter((s) => p.votes.get(s) === false);
    const agreedSeats = p.activeSeats.filter((s) => !declines.includes(s));
    pending.delete(gameId);

    if (forfeit) {
      io.to(lobbyRoom(gameId)).emit('abort:resolved', { action: 'forfeit' });
      await applyAndBroadcast(io, gameId, (state) => removePlayers(state, agreedSeats));
    } else {
      io.to(lobbyRoom(gameId)).emit('abort:resolved', { action: 'resume' });
    }
  });
}
