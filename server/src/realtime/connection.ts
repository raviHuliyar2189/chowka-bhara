import type { Server, Socket } from 'socket.io';
import { verifySession, type SessionPayload } from '../auth/tokens';
import { pool } from '../db/pool';
import { lobbyRoom } from './io';
import { registerGameplayHandlers } from './gameplay';
import { registerAbortHandlers } from './abort';

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

    socket.on('join-lobby-room', async (payload: { gameId?: string }, ack?: (ok: boolean) => void) => {
      const gameId = payload?.gameId;
      if (typeof gameId !== 'string' || !(await isParticipant(gameId, session.playerId))) {
        ack?.(false);
        return;
      }
      await socket.join(lobbyRoom(gameId));
      ack?.(true);
    });

    registerGameplayHandlers(io, socket, session);
    registerAbortHandlers(io, socket, session);
  });
}
