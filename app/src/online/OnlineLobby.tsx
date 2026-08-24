import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { fetchGame, joinGame, declineGame, abortLobby, startGame, type LobbyState, type PlayerInfo } from './api';
import { connectSocket } from './socket';
import type { GameState } from '../game/turnEngine';
import { SEATS_BY_COUNT, type PlayerId } from '../game/paths';

interface Props {
  gameId: string;
  me: PlayerInfo;
  onStart: (state: GameState, mySeat: PlayerId) => void;
}

type Phase = 'loading' | 'choice' | 'declined' | 'waiting';

export default function OnlineLobby({ gameId, me, onStart }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);
  // Known as soon as we're actually seated — kept in a ref (not state) since it never changes
  // and the game-updated handler below needs it without retriggering the effect.
  const mySeatRef = useRef<PlayerId | null>(null);
  const socketRef = useRef<Socket | null>(null);

  function connectAndListen() {
    const socket = connectSocket();
    socketRef.current = socket;
    socket.emit('join-lobby-room', { gameId });
    socket.on('lobby-updated', (updated: LobbyState) => {
      if (updated.status === 'aborted') {
        setError('This game was aborted.');
        return;
      }
      setLobby(updated);
    });
    // Fires for whoever clicked "Start Game" AND everyone else watching — a single source of
    // truth for "the game has begun" instead of the clicking button handling its own
    // transition locally (which would leave everyone else stranded in the lobby).
    socket.on('game-updated', (state: GameState) => {
      if (mySeatRef.current) onStart(state, mySeatRef.current);
    });
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await fetchGame(gameId);
        if (current.status === 'aborted') {
          if (!cancelled) setError('This game was aborted.');
          return;
        }
        const mySeat = current.seats.find((s) => s.playerId === me.id);

        if (mySeat?.status === 'declined') {
          if (!cancelled) {
            setLobby(current);
            setPhase('declined');
          }
          return;
        }

        if (mySeat?.status === 'joined') {
          mySeatRef.current = mySeat.seat as PlayerId;
          // Already underway (or finished) — reopening the link (closed tab, refresh, new
          // device) rejoins straight into the live board instead of a waiting room that's
          // already moved on.
          if (current.state) {
            if (!cancelled) onStart(current.state, mySeatRef.current);
            return;
          }
          if (cancelled) return;
          setLobby(current);
          setPhase('waiting');
          connectAndListen();
          return;
        }

        // Not seated at all yet — show the Join/Decline choice, don't claim a seat until they
        // actually pick one.
        if (current.status !== 'lobby') {
          if (!cancelled) setError("This game has already started and you weren't part of it.");
          return;
        }
        if (current.seats.length >= current.seatCount) {
          if (!cancelled) setError('This game is already full.');
          return;
        }
        if (!cancelled) {
          setLobby(current);
          setPhase('choice');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this game.');
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, me.id]);

  async function handleJoinClick() {
    setError(null);
    try {
      const updated = await joinGame(gameId);
      const seat = updated.seats.find((s) => s.playerId === me.id)!.seat as PlayerId;
      mySeatRef.current = seat;
      setLobby(updated);
      setPhase('waiting');
      connectAndListen();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join.');
    }
  }

  async function handleDeclineClick() {
    setError(null);
    try {
      const updated = await declineGame(gameId);
      setLobby(updated);
      setPhase('declined');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline.');
    }
  }

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

  async function handleCancelGame() {
    setCancelling(true);
    setError(null);
    try {
      await abortLobby(gameId);
      // No local transition here either — the lobby-updated broadcast's status==='aborted'
      // check above handles it uniformly for the canceller and everyone else waiting.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the game.');
      setCancelling(false);
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

  if (phase === 'loading' || !lobby) {
    return (
      <div className="modal">
        <p>Loading game…</p>
      </div>
    );
  }

  const joinedNames = lobby.seats.filter((s) => s.status === 'joined').map((s) => s.displayName).join(', ');

  if (phase === 'declined') {
    return (
      <div className="modal">
        <h2>You declined this game.</h2>
      </div>
    );
  }

  if (phase === 'choice') {
    return (
      <div className="modal">
        <h2>Game Invite</h2>
        <p>
          <strong>{lobby.createdByName}</strong> invited you to a <strong>{lobby.seatCount}</strong>-player
          Chowka Bhara game.
        </p>
        <p>Joined so far: {joinedNames || 'no one yet'}.</p>
        <button className="action-btn btn-start" onClick={handleJoinClick}>
          Join
        </button>
        <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={handleDeclineClick}>
          Decline
        </button>
      </div>
    );
  }

  const seatOrder = SEATS_BY_COUNT[lobby.seatCount] ?? [];
  const seatByName = new Map(lobby.seats.map((s) => [s.seat, s]));
  const whatsappText = encodeURIComponent(
    `${lobby.createdByName} started a Chowka Bhara game for ${lobby.seatCount} players. Joined so far: ${
      joinedNames || 'no one yet'
    }. Tap to join: ${inviteLink}`
  );
  const isCreator = lobby.createdBy === me.id;

  return (
    <div className="modal">
      <h2>Waiting Room</h2>
      <p>
        Started by <strong>{lobby.createdByName}</strong> — {lobby.seatCount} players planned.
      </p>

      {!lobby.canStart && (
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
          let label = 'Waiting for a response…';
          if (s?.status === 'joined') label = `${s.displayName} — ✅ Joined`;
          else if (s?.status === 'declined') label = `${s.displayName} — ❌ Declined`;
          return (
            <li key={seat}>
              {seat}: {label}
            </li>
          );
        })}
      </ul>
      <button className="action-btn btn-start" disabled={!lobby.canStart || starting} onClick={handleStart}>
        {starting ? 'Starting…' : lobby.canStart ? 'Start Game' : 'Waiting for at least 2 players…'}
      </button>

      {isCreator && (
        <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={handleCancelGame} disabled={cancelling}>
          {cancelling ? 'Cancelling…' : 'Cancel Game'}
        </button>
      )}
    </div>
  );
}
