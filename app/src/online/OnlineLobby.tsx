import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { fetchGame, joinGame, startGame, type LobbyState, type PlayerInfo } from './api';
import { connectSocket } from './socket';
import type { GameState } from '../game/turnEngine';
import type { PlayerId } from '../game/paths';

interface Props {
  gameId: string;
  me: PlayerInfo;
  onStart: (state: GameState, mySeat: PlayerId) => void;
}

export default function OnlineLobby({ gameId, me, onStart }: Props) {
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Known as soon as the lobby loads, before the game exists — kept in a ref (not state) since
  // it never changes and the game-updated handler below needs it without retriggering the effect.
  const mySeatRef = useRef<PlayerId | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    (async () => {
      try {
        let current = await fetchGame(gameId);
        const mySeat = current.seats.find((s) => s.playerId === me.id);
        mySeatRef.current = (mySeat?.seat as PlayerId) ?? null;
        // Visiting the lobby (e.g. via the emailed invite link) counts as accepting the invite.
        if (mySeat && mySeat.status === 'invited') {
          current = await joinGame(gameId);
        }
        if (cancelled) return;
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

  return (
    <div className="modal">
      <h2>Waiting Room</h2>
      <ul className="player-list">
        {lobby.seats.map((s) => (
          <li key={s.seat}>
            {s.seat}: {s.displayName} — {s.status === 'joined' ? '✅ Joined' : '⏳ Invited'}
          </li>
        ))}
      </ul>
      <button className="action-btn btn-start" disabled={!lobby.allJoined || starting} onClick={handleStart}>
        {starting ? 'Starting…' : lobby.allJoined ? 'Start Game' : 'Waiting for everyone to join…'}
      </button>
    </div>
  );
}
