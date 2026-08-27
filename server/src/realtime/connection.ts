import type { Server, Socket } from 'socket.io';
import { verifySession, type SessionPayload } from '../auth/tokens';
import { pool } from '../db/pool';
import { lobbyRoom } from './io';
import { registerGameplayHandlers, seatFor } from './gameplay';
import { registerResignHandlers } from './resign';
import { registerVoiceHandlers } from './voice';
import { markConnected, markDisconnected, connectedSeatIds } from './presence';

async function isParticipant(gameId: string, playerId: string): Promise<boolean> {
  const { rows } = await pool.query('select 1 from game_seats where game_id = $1 and player_id = $2', [
    gameId,
    playerId,
  ]);
  return rows.length > 0;
}

export function registerConnectionHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Bearer token via the socket handshake's auth payload, not a cookie — same reasoning as
    // server/src/auth/middleware.ts (cross-domain deployment makes cookies unreliable here).
    const token = socket.handshake.auth?.token;
    const session: SessionPayload | null = typeof token === 'string' ? verifySession(token) : null;

    if (!session) {
      socket.emit('auth-error', { error: 'Not signed in.' });
      socket.disconnect(true);
      return;
    }

    // Which (gameId, seat) this specific socket represents, once join-lobby-room succeeds — needed
    // on disconnect below to know what presence state to clean up. A socket only ever represents
    // one game at a time in practice (OnlineLobby/OnlinePlay each own a fresh connection for
    // exactly the one game they're mounted for, torn down on unmount — see connectSocket's
    // callers), so a single pair (not a list) is enough.
    let presenceGameId: string | null = null;
    let presenceSeat: string | null = null;

    socket.on('join-lobby-room', async (payload: { gameId?: string }, ack?: (ok: boolean) => void) => {
      const gameId = payload?.gameId;
      if (typeof gameId !== 'string' || !(await isParticipant(gameId, session.playerId))) {
        ack?.(false);
        return;
      }
      await socket.join(lobbyRoom(gameId));

      // Online mode: a visible per-player connected/disconnected indicator (§13) — seat rather
      // than player id, matching how everything else in the game room is addressed.
      const seat = await seatFor(gameId, session.playerId);
      if (seat) {
        presenceGameId = gameId;
        presenceSeat = seat;
        markConnected(io, gameId, seat, socket.id);
        // The room-wide broadcast above only fires for this seat's *first* connection — this
        // socket still needs to know the *current* full picture (everyone else's presence),
        // not just future changes.
        socket.emit('presence:update', { connectedSeats: connectedSeatIds(gameId) });
      }

      ack?.(true);
    });

    socket.on('disconnect', () => {
      if (presenceGameId && presenceSeat) markDisconnected(io, presenceGameId, presenceSeat, socket.id);
    });

    registerGameplayHandlers(io, socket, session);
    registerResignHandlers(io, socket, session);
    registerVoiceHandlers(io, socket, session);
  });
}
