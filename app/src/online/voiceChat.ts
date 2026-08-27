import type { Socket } from 'socket.io-client';
import type { PlayerId } from '../game/paths';

// Google's public STUN server — free, no signup, works for the large majority of home/mobile NAT
// setups. There's deliberately no TURN server: running one has a real ongoing cost, and this is a
// small-scale hobby deployment. The practical consequence is that voice can fail to connect
// between two specific players stuck behind unusually restrictive NATs/firewalls (some corporate
// networks, certain carrier-grade NAT setups) even though the game itself keeps working fine over
// the existing server-relayed Socket.IO connection — see REQUIREMENTS.md §13.
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

type SignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

interface PeerEntry {
  pc: RTCPeerConnection;
  // ICE candidates can arrive before setRemoteDescription has resolved (they're sent as soon as
  // discovered, independent of the offer/answer round-trip) — addIceCandidate throws if the
  // remote description isn't set yet, so anything that arrives too early is buffered here and
  // flushed right after.
  pendingCandidates: RTCIceCandidateInit[];
}

export interface VoiceChatCallbacks {
  // The full current voice roster, whenever it changes (this is who's IN the channel — separate
  // from whose individual peer connections have actually finished negotiating).
  onRosterChange: (seats: PlayerId[]) => void;
  // stream is null when a peer's connection closes (they left, or it failed) — the caller should
  // stop playing/remove that peer's audio element.
  onRemoteStream: (seat: PlayerId, stream: MediaStream | null) => void;
  onError: (message: string) => void;
}

// Signaling-only on the server (server/src/realtime/voice.ts) — every participant connects
// directly to every other one (a full mesh; fine up to this game's own 4-player cap, at most 3
// simultaneous peer connections per client). No media server: audio never passes through the
// backend at all, only these small offer/answer/ICE-candidate messages relayed over the same
// Socket.IO connection gameplay already uses.
export class VoiceChatManager {
  private socket: Socket;
  private gameId: string;
  private mySeat: PlayerId;
  private callbacks: VoiceChatCallbacks;
  private localStream: MediaStream | null = null;
  private peers = new Map<PlayerId, PeerEntry>();
  private joined = false;

  constructor(socket: Socket, gameId: string, mySeat: PlayerId, callbacks: VoiceChatCallbacks) {
    this.socket = socket;
    this.gameId = gameId;
    this.mySeat = mySeat;
    this.callbacks = callbacks;
    this.socket.on('voice:roster', this.handleRoster);
    this.socket.on('voice:peer-joined', this.handlePeerJoined);
    this.socket.on('voice:peer-left', this.handlePeerLeft);
    this.socket.on('voice:signal', this.handleSignal);
  }

  isJoined(): boolean {
    return this.joined;
  }

  // Opt-in only — never requested automatically. Browsers show their own mic-permission prompt on
  // the first call; a denial or no-microphone-available error is reported via onError rather than
  // thrown, since the caller is a plain button click handler, not something already in a try/catch.
  async join(): Promise<void> {
    if (this.joined) return;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : 'Could not access the microphone.');
      return;
    }
    this.joined = true;
    this.socket.emit('voice:join', { gameId: this.gameId });
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.socket.emit('voice:leave', { gameId: this.gameId });
    for (const seat of [...this.peers.keys()]) this.closePeer(seat);
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  // Called when this component unmounts — same as leave() but also drops the socket listeners, so
  // nothing here keeps firing after the page that owns it is gone.
  destroy(): void {
    this.leave();
    this.socket.off('voice:roster', this.handleRoster);
    this.socket.off('voice:peer-joined', this.handlePeerJoined);
    this.socket.off('voice:peer-left', this.handlePeerLeft);
    this.socket.off('voice:signal', this.handleSignal);
  }

  private createPeerConnection(seat: PlayerId): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.localStream?.getTracks().forEach((track) => {
      if (this.localStream) pc.addTrack(track, this.localStream);
    });
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.socket.emit('voice:signal', {
        gameId: this.gameId,
        toSeat: seat,
        data: { type: 'ice', candidate: event.candidate.toJSON() } satisfies SignalData,
      });
    };
    pc.ontrack = (event) => {
      this.callbacks.onRemoteStream(seat, event.streams[0] ?? null);
    };
    this.peers.set(seat, { pc, pendingCandidates: [] });
    return pc;
  }

  private closePeer(seat: PlayerId): void {
    const entry = this.peers.get(seat);
    if (!entry) return;
    entry.pc.close();
    this.peers.delete(seat);
    this.callbacks.onRemoteStream(seat, null);
  }

  private async flushPendingCandidates(seat: PlayerId): Promise<void> {
    const entry = this.peers.get(seat);
    if (!entry) return;
    for (const candidate of entry.pendingCandidates) {
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    entry.pendingCandidates = [];
  }

  // Fires for every OTHER already-in participant the moment a new peer joins. Deliberately
  // asymmetric — existing members always initiate the offer to whoever just joined, the new
  // joiner only ever answers — so two peers can never both try to offer the same connection at
  // once ("glare"). See voice.ts's own copy of this same reasoning server-side.
  private handlePeerJoined = async ({ seat }: { seat: string }) => {
    const peerSeat = seat as PlayerId;
    if (!this.joined || peerSeat === this.mySeat) return;
    const pc = this.createPeerConnection(peerSeat);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit('voice:signal', {
      gameId: this.gameId,
      toSeat: peerSeat,
      data: { type: 'offer', sdp: offer } satisfies SignalData,
    });
  };

  private handlePeerLeft = ({ seat }: { seat: string }) => {
    this.closePeer(seat as PlayerId);
  };

  private handleRoster = ({ seats }: { seats: string[] }) => {
    this.callbacks.onRosterChange(seats as PlayerId[]);
  };

  private handleSignal = async ({ fromSeat, data }: { fromSeat: string; data: SignalData }) => {
    const seat = fromSeat as PlayerId;
    if (data.type === 'offer') {
      if (!this.joined) return; // shouldn't happen — offers only ever target a seat already in voice
      const pc = this.peers.get(seat)?.pc ?? this.createPeerConnection(seat);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      await this.flushPendingCandidates(seat);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('voice:signal', {
        gameId: this.gameId,
        toSeat: seat,
        data: { type: 'answer', sdp: answer } satisfies SignalData,
      });
    } else if (data.type === 'answer') {
      const entry = this.peers.get(seat);
      if (!entry) return;
      await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      await this.flushPendingCandidates(seat);
    } else if (data.type === 'ice') {
      const entry = this.peers.get(seat);
      if (!entry) return;
      if (entry.pc.remoteDescription) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        entry.pendingCandidates.push(data.candidate);
      }
    }
  };
}
