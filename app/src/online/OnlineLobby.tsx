import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { fetchGame, joinGame, startGame, type LobbyState, type PlayerInfo } from './api';
import { connectSocket } from './socket';
import type { GameState } from '../game/turnEngine';
import { SEATS_BY_COUNT, type PlayerId } from '../game/paths';

interface Props {
  gameId: string;
  me: PlayerInfo;
  onStart: (state: GameState, mySeat: PlayerId) => void;
}

export default function OnlineLobby({ gameId, me, onStart }: Props) {
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  // Known as soon as the lobby loads, before the game exists — kept in a ref (not state) since
  // it never changes and the game-updated handler below needs it without retriggering the effect.
  const mySeatRef = useRef<PlayerId | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    (async () => {
      try {
        let current = await fetchGame(gameId);
        let mySeat = current.seats.find((s) => s.playerId === me.id);
        if (!mySeat) {
          if (current.status !== 'lobby') {
            if (!cancelled) setError("This game has already started and you weren't part of it.");
            return;
          }
          if (current.seats.length >= current.seatCount) {
            if (!cancelled) setError('This game is already full.');
            return;
          }
          if (cancelled) return;
          // Opening the link is what claims a seat — no separate "accept invite" step.
          current = await joinGame(gameId);
          mySeat = current.seats.find((s) => s.playerId === me.id);
        }
        const seat = mySeat!.seat as PlayerId;
        mySeatRef.current = seat;
        if (cancelled) return;

        // Already underway (or finished) — reopening the link (closed tab, refresh, new device)
        // rejoins straight into the live board instead of a waiting room that's already moved on.
        if (current.state) {
          onStart(current.state, seat);
          return;
        }
        setLobby(current);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this game.');
        return;
      }

      socket = connectSocket();
      socket.emit('join-lobby-room', { gameId });
      socket.on('lobby-updated', (updated: LobbyState) => {
        if (!cancelled) setLobby(updated);
      });
      // Fires for whoever clicked "Start Game" AND everyone else watching — a single source of
      // truth for "the game has begun" instead of the clicking button handling its own
      // transition locally (which would leave everyone else stranded in the lobby).
      socket.on('game-updated', (state: GameState) => {
        if (!cancelled && mySeatRef.current) onStart(state, mySeatRef.current);
      });
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, me.id]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      await startGame(gameId);
      // No local transition here on purpose — the game-updated broadcast above handles it, the
      // same way for the clicker as for everyone else.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the game.');
      setStarting(false);
    }
  }

  const inviteLink = `${window.location.origin}/games/${gameId}`;

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — the link is still shown in the field to copy manually.
    }
  }

  if (error) {
    return (
      <div className="modal">
        <p className="online-error">{error}</p>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="modal">
        <p>Loading game…</p>
      </div>
    );
  }

  const seatOrder = SEATS_BY_COUNT[lobby.seatCount] ?? [];
  const seatByName = new Map(lobby.seats.map((s) => [s.seat, s]));
  const whatsappText = encodeURIComponent(`Join my Chowka Bhara game: ${inviteLink}`);

  return (
    <div className="modal">
      <h2>Waiting Room</h2>

      {!lobby.allJoined && (
        <div className="setup-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
          <label className="setup-label">Share this link:</label>
          <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="action-btn" onClick={handleCopyLink}>
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <a
              className="action-btn"
              href={`https://wa.me/?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
      )}

      <ul className="player-list">
        {seatOrder.map((seat) => {
          const s = seatByName.get(seat);
          return <li key={seat}>{seat}: {s ? `${s.displayName} — ✅ Joined` : 'Waiting for a player…'}</li>;
        })}
      </ul>
      <button className="action-btn btn-start" disabled={!lobby.allJoined || starting} onClick={handleStart}>
        {starting ? 'Starting…' : lobby.allJoined ? 'Start Game' : 'Waiting for everyone to join…'}
      </button>
    </div>
  );
}
