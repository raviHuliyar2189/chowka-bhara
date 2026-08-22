import type { Server, Socket } from 'socket.io';
import { verifySession, type SessionPayload } from '../auth/tokens';
import { pool } from '../db/pool';
import { lobbyRoom } from './io';
import { registerGameplayHandlers } from './gameplay';

const SESSION_COOKIE = 'chowka_session';

function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function isParticipant(gameId: string, playerId: string): Promise<boolean> {
  const { rows } = await pool.query('select 1 from game_seats where game_id = $1 and player_id = $2', [
    gameId,
    playerId,
  ]);
  return rows.length > 0;
}

export function registerConnectionHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const token = readSessionCookie(socket.handshake.headers.cookie);
    const session: SessionPayload | null = token ? verifySession(token) : null;

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
  });
}
