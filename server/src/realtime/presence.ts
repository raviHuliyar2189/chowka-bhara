import type { Server } from 'socket.io';
import { lobbyRoom } from './io';

// In-memory only, per server process — presence is inherently ephemeral (this process's live
// connections right now), not something that needs to survive a restart or be shared across
// server instances. gameId -> seat -> the set of socket.ids currently connected for that seat
// (almost always 0 or 1, but a player could genuinely have two tabs/devices open at once, so a
// seat only reads as "offline" once every one of its sockets has disconnected).
const connectedSeats = new Map<string, Map<string, Set<string>>>();

function seatsFor(gameId: string): Map<string, Set<string>> {
  let seats = connectedSeats.get(gameId);
  if (!seats) {
    seats = new Map();
    connectedSeats.set(gameId, seats);
  }
  return seats;
}

export function connectedSeatIds(gameId: string): string[] {
  return [...(connectedSeats.get(gameId)?.keys() ?? [])];
}

// Reused by voice.ts to relay a WebRTC signaling message directly to whichever socket(s) a given
// seat is currently connected from — the same underlying connected-socket tracking this module
// already maintains for presence, just exposed for a second purpose rather than duplicated.
export function socketIdsForSeat(gameId: string, seat: string): string[] {
  return [...(connectedSeats.get(gameId)?.get(seat) ?? [])];
}

function broadcastPresence(io: Server, gameId: string): void {
  io.to(lobbyRoom(gameId)).emit('presence:update', { connectedSeats: connectedSeatIds(gameId) });
}

// Called once a socket has actually joined the room and its seat is known (see connection.ts's
// join-lobby-room handler) — only broadcasts when this is the seat's *first* live connection, so a
// second tab/device for the same player doesn't spam a redundant update.
export function markConnected(io: Server, gameId: string, seat: string, socketId: string): void {
  const seats = seatsFor(gameId);
  const sockets = seats.get(seat) ?? new Set<string>();
  const wasEmpty = sockets.size === 0;
  sockets.add(socketId);
  seats.set(seat, sockets);
  if (wasEmpty) broadcastPresence(io, gameId);
}

// Called on socket disconnect (see connection.ts) — only broadcasts once every one of that seat's
// sockets is gone, so briefly having two tabs open doesn't flicker the seat to "offline" when just
// one of them closes.
export function markDisconnected(io: Server, gameId: string, seat: string, socketId: string): void {
  const seats = connectedSeats.get(gameId);
  const sockets = seats?.get(seat);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    seats!.delete(seat);
    broadcastPresence(io, gameId);
  }
}
