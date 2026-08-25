import type { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import { removePlayers } from '@chowka/game-core/turnEngine';
import type { PlayerId } from '@chowka/game-core/paths';
import type { SessionPayload } from '../auth/tokens';
import { lobbyRoom } from './io';
import { seatFor, applyAndBroadcast } from './gameplay';

// Adapted from hotseat's unconditional self-Resign (ResignModal.tsx / HotseatPage.tsx's
// handleResign) for players on separate devices: hotseat resigns "whoever's turn it currently
// is" since only one device/person is holding it; online instead resigns the requesting player
// specifically, since each player has their own device and might want to bow out on someone
// else's turn. Fully replaces the old in-game consensus Abort flow (see the deleted abort.ts) —
// no vote, just a broadcast notice so everyone at the table knows why a seat just emptied.
export function registerResignHandlers(io: Server, socket: Socket, session: SessionPayload): void {
  socket.on('game:resign', async ({ gameId }: { gameId: string }) => {
    const seat = (await seatFor(gameId, session.playerId)) as PlayerId | null;
    if (!seat) return;

    const { rows } = await pool.query('select resign_allowed from games where id = $1', [gameId]);
    if (!rows[0]?.resign_allowed) return;

    let resigningName: string | null = null;
    await applyAndBroadcast(io, gameId, (state) => {
      const player = state.players.find((p) => p.id === seat);
      if (!player || player.isFinished || player.hasLost) return state;
      resigningName = player.name;
      return removePlayers(state, [seat]);
    });

    if (resigningName) {
      io.to(lobbyRoom(gameId)).emit('resign:notice', { playerName: resigningName });
    }
  });
}
