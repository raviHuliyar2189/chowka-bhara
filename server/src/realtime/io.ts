import type { Server } from 'socket.io';

// Set once at server startup (see index.ts) — kept here (rather than passed around as a
// parameter through every route module) so REST route handlers can trigger a broadcast after a
// DB mutation without needing the Socket.IO server threaded through their whole call chain.
let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.IO server not initialized yet.');
  return io;
}

export function lobbyRoom(gameId: string): string {
  return `game:${gameId}`;
}
