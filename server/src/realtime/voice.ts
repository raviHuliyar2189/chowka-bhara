import type { Server, Socket } from 'socket.io';
import { lobbyRoom } from './io';
import { socketIdsForSeat, connectedSeatIds } from './presence';
import { seatFor } from './gameplay';
import type { SessionPayload } from '../auth/tokens';

// In-memory only, per server process — same reasoning as presence.ts. gameId -> the set of seats
// currently in that game's voice channel. The server never touches audio itself (no media
// server/SFU) — this is purely who's-in/who's-out bookkeeping plus a signaling relay so peers can
// find each other and negotiate their own direct WebRTC connections (a full mesh: fine up to the
// game's own 4-player cap, since each client only ever needs at most 3 simultaneous peer
// connections).
const voiceParticipants = new Map<string, Set<string>>();

function participantsFor(gameId: string): Set<string> {
  let seats = voiceParticipants.get(gameId);
  if (!seats) {
    seats = new Set();
    voiceParticipants.set(gameId, seats);
  }
  return seats;
}

function broadcastRoster(io: Server, gameId: string): void {
  io.to(lobbyRoom(gameId)).emit('voice:roster', { seats: [...(voiceParticipants.get(gameId) ?? [])] });
}

export function registerVoiceHandlers(io: Server, socket: Socket, session: SessionPayload): void {
  // Which (gameId, seat) this socket most recently joined voice as — for cleanup on disconnect,
  // same pattern as connection.ts's own presence tracking.
  let voiceGameId: string | null = null;
  let voiceSeat: string | null = null;

  socket.on('voice:join', async ({ gameId }: { gameId: string }) => {
    const seat = await seatFor(gameId, session.playerId);
    if (!seat) return;
    // Must actually be connected to this game's room already (join-lobby-room) — voice piggybacks
    // on that same room for its own broadcasts (roster updates), and relies on presence's own
    // socket-by-seat tracking to route signaling messages.
    if (!connectedSeatIds(gameId).includes(seat)) return;

    voiceGameId = gameId;
    voiceSeat = seat;
    const seats = participantsFor(gameId);
    if (seats.has(seat)) return; // already in (e.g. a second tab) — no-op, no duplicate join event
    seats.add(seat);

    // Deliberately asymmetric so no two peers ever both try to offer the same connection at once
    // (WebRTC "glare"): every *already-in* participant reacts to this and initiates an offer to
    // the new joiner; the new joiner only ever answers, never offers, on the way in. Sent to the
    // whole room (not just voice participants) — harmless no-op for anyone not in voice, and
    // avoids needing a separate participants-only room.
    socket.to(lobbyRoom(gameId)).emit('voice:peer-joined', { seat });
    broadcastRoster(io, gameId);
  });

  function leaveVoice() {
    if (!voiceGameId || !voiceSeat) return;
    const seats = voiceParticipants.get(voiceGameId);
    if (!seats?.has(voiceSeat)) return;
    seats.delete(voiceSeat);
    io.to(lobbyRoom(voiceGameId)).emit('voice:peer-left', { seat: voiceSeat });
    broadcastRoster(io, voiceGameId);
    voiceGameId = null;
    voiceSeat = null;
  }

  socket.on('voice:leave', leaveVoice);
  socket.on('disconnect', leaveVoice);

  // The actual WebRTC negotiation (SDP offers/answers, ICE candidates) — this server never
  // inspects `data`, just relays it verbatim to whichever live socket(s) currently represent
  // `toSeat`, the same way presence already tracks who that is. Peers do all the real work
  // (audio never flows through this server at all, only these small signaling messages do).
  socket.on(
    'voice:signal',
    ({ gameId, toSeat, data }: { gameId: string; toSeat: string; data: unknown }) => {
      if (!voiceGameId || voiceGameId !== gameId || !voiceSeat) return;
      for (const targetSocketId of socketIdsForSeat(gameId, toSeat)) {
        io.to(targetSocketId).emit('voice:signal', { fromSeat: voiceSeat, data });
      }
    }
  );
}
