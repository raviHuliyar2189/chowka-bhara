import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { fetchGame, joinGame, declineGame, abortLobby, startGame, type LobbyState, type PlayerInfo } from './api';
import { connectSocket } from './socket';
import type { GameState } from '../game/turnEngine';
import { SEATS_BY_COUNT, type PlayerId } from '../game/paths';
import { useT } from '../i18n/strings';

interface Props {
  gameId: string;
  me: PlayerInfo;
  justCreated?: boolean;
  onStart: (state: GameState, mySeat: PlayerId, resignAllowed: boolean) => void;
}

type Phase = 'loading' | 'choice' | 'declined' | 'waiting';

export default function OnlineLobby({ gameId, me, justCreated, onStart }: Props) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('loading');
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Known as soon as we're actually seated — kept in a ref (not state) since it never changes
  // and the game-updated handler below needs it without retriggering the effect.
  const mySeatRef = useRef<PlayerId | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Which joined seats currently have a live connection (§13) — same server-authoritative signal
  // OnlinePlay.tsx's own board uses, shown here too since a player can sit in this waiting room
  // for a while before Start is clicked.
  const [connectedSeats, setConnectedSeats] = useState<PlayerId[]>([]);
  // Guards the WhatsApp auto-open below to exactly once per mount, even though the effect that
  // triggers it can in principle re-run (StrictMode double-invoke, a fast gameId/me.id change).
  const autoOpenedRef = useRef(false);

  // Single source of truth for the invite link/text, used both by the auto-open below and the
  // manual "Share on WhatsApp" button in the render — invitee selection happens entirely inside
  // WhatsApp's own picker (one or more contacts/groups), not in this app.
  function whatsappLinkFor(state: LobbyState): string {
    const link = `${window.location.origin}/games/${gameId}`;
    const joined =
      state.seats.filter((s) => s.status === 'joined').map((s) => s.displayName).join(', ') || t('lobby.noOneYet');
    const text = encodeURIComponent(t('lobby.whatsappText', state.createdByName, state.seatCount, joined, link));
    return `https://wa.me/?text=${text}`;
  }

  function connectAndListen() {
    const socket = connectSocket();
    socketRef.current = socket;
    // Re-joins on every reconnect, not just the first connect — see OnlinePlay.tsx's own copy of
    // this same fix for why (a socket.io-client auto-reconnect after a network blip never re-runs
    // application-level room joins on its own). Also re-fetches once the join is actually
    // acknowledged, to catch up on anything that happened in the gap between this device
    // connecting and its join finishing — e.g. another player joining/declining right in that
    // window, which would otherwise broadcast to a room this socket wasn't in yet and leave this
    // screen stuck showing stale "waiting for a response" state indefinitely (a real reported bug:
    // the creator kept seeing "waiting" even after the second player had already joined).
    socket.on('connect', () => {
      socket.emit('join-lobby-room', { gameId }, (ok: boolean) => {
        if (!ok) return;
        fetchGame(gameId)
          .then((fresh) => {
            if (fresh.status !== 'aborted') setLobby(fresh);
          })
          .catch(() => {});
      });
    });
    socket.on('presence:update', ({ connectedSeats: seats }: { connectedSeats: PlayerId[] }) => {
      setConnectedSeats(seats);
    });
    socket.on('lobby-updated', (updated: LobbyState) => {
      if (updated.status === 'aborted') {
        setError(t('lobby.aborted'));
        return;
      }
      setLobby(updated);
    });
    // Fires for whoever clicked "Start Game" AND everyone else watching — a single source of
    // truth for "the game has begun" instead of the clicking button handling its own
    // transition locally (which would leave everyone else stranded in the lobby).
    //
    // Deliberately re-fetches the lobby here rather than trusting mySeatRef (set back at join
    // time): /start re-seats everyone onto the fair topology for however many actually joined
    // (§13 — e.g. a 4-planned game where only 2 joined moves the second joiner from their
    // join-time P2 to P3), so a seat claimed at join time can be stale by the time the game
    // actually starts. Using the stale seat here broke board rotation and turn detection for
    // exactly the player whose seat changed — their own isMyTurn check compared the game's real
    // current seat against a seat they were no longer actually sitting in.
    socket.on('game-updated', (state: GameState) => {
      fetchGame(gameId)
        .then((fresh) => {
          const seat = fresh.seats.find((s) => s.playerId === me.id)?.seat as PlayerId | undefined;
          if (seat) {
            mySeatRef.current = seat;
            onStart(state, seat, fresh.resignAllowed);
          } else if (mySeatRef.current) {
            onStart(state, mySeatRef.current, fresh.resignAllowed);
          }
        })
        .catch(() => {
          if (mySeatRef.current) onStart(state, mySeatRef.current, lobby?.resignAllowed ?? false);
        });
    });
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await fetchGame(gameId);
        if (current.status === 'aborted') {
          if (!cancelled) setError(t('lobby.aborted'));
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
            if (!cancelled) onStart(current.state, mySeatRef.current, current.resignAllowed);
            return;
          }
          if (cancelled) return;
          setLobby(current);
          setPhase('waiting');
          connectAndListen();
          // Only for the creator's own first arrival right after clicking "Create Game" (see
          // justCreated's own comment in App.tsx) — opens WhatsApp with the invite pre-filled so
          // the very next thing they do is pick who to send it to, no separate "now go invite
          // people" step. Everyone else who reaches this waiting room already came in via the
          // link, so there's nothing for them to send. A 1-player game has no one to invite at
          // all — it secretly plays against the AI (§13) — so this never fires for one.
          if (justCreated && current.seatCount > 1 && !autoOpenedRef.current) {
            autoOpenedRef.current = true;
            window.open(whatsappLinkFor(current), '_blank', 'noopener,noreferrer');
          }
          return;
        }

        // Not seated at all yet — show the Join/Decline choice, don't claim a seat until they
        // actually pick one.
        if (current.status !== 'lobby') {
          if (!cancelled) setError(t('lobby.notPart'));
          return;
        }
        if (current.seats.length >= current.seatCount) {
          if (!cancelled) setError(t('lobby.full'));
          return;
        }
        if (!cancelled) {
          setLobby(current);
          setPhase('choice');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('lobby.loadFailed'));
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
      setError(err instanceof Error ? err.message : t('lobby.joinFailed'));
    }
  }

  async function handleDeclineClick() {
    setError(null);
    try {
      const updated = await declineGame(gameId);
      setLobby(updated);
      setPhase('declined');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lobby.declineFailed'));
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
      setError(err instanceof Error ? err.message : t('lobby.startFailed'));
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
      setError(err instanceof Error ? err.message : t('lobby.cancelFailed'));
      setCancelling(false);
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
        <p>{t('lobby.loading')}</p>
      </div>
    );
  }

  const joinedNames = lobby.seats.filter((s) => s.status === 'joined').map((s) => s.displayName).join(', ');
  const joinedNamesOrNone = joinedNames || t('lobby.noOneYet');

  if (phase === 'declined') {
    return (
      <div className="modal">
        <h2>{t('lobby.declinedTitle')}</h2>
      </div>
    );
  }

  if (phase === 'choice') {
    return (
      <div className="modal">
        <h2>{t('lobby.inviteTitle')}</h2>
        <p>{t('lobby.inviteBody', lobby.createdByName, lobby.seatCount)}</p>
        <p>{t('lobby.joinedSoFar', joinedNamesOrNone)}</p>
        <button className="action-btn btn-start" onClick={handleJoinClick}>
          {t('lobby.join')}
        </button>
        <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={handleDeclineClick}>
          {t('lobby.decline')}
        </button>
      </div>
    );
  }

  const seatOrder = SEATS_BY_COUNT[lobby.seatCount] ?? [];
  const seatByName = new Map(lobby.seats.map((s) => [s.seat, s]));
  const isCreator = lobby.createdBy === me.id;

  return (
    <div className="modal">
      <h2>{t('lobby.waitingRoom')}</h2>
      <p>{t('lobby.startedBy', lobby.createdByName, lobby.seatCount)}</p>

      {!lobby.canStart && (
        <div className="setup-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
          <a className="action-btn btn-start" href={whatsappLinkFor(lobby)} target="_blank" rel="noopener noreferrer">
            {t('lobby.shareWhatsApp')}
          </a>
        </div>
      )}

      <ul className="player-list">
        {seatOrder.map((seat) => {
          const s = seatByName.get(seat);
          let label = t('lobby.waitingForResponse');
          if (s?.status === 'joined') label = t('lobby.joinedLabel', s.displayName);
          else if (s?.status === 'declined') label = t('lobby.declinedLabel', s.displayName);
          const isOnline = connectedSeats.includes(seat);
          return (
            <li key={seat}>
              {/* Presence only means anything once a seat is actually joined — a still-empty or
                  declined seat has no connection to show one way or the other. */}
              {s?.status === 'joined' && (
                <span
                  className={`presence-dot ${isOnline ? 'online' : 'offline'} presence-dot-inline`}
                  aria-hidden="true"
                  title={t(isOnline ? 'presence.online' : 'presence.offline')}
                />
              )}
              {seat}: {label}
            </li>
          );
        })}
      </ul>
      {isCreator ? (
        <button className="action-btn btn-start" disabled={!lobby.canStart || starting} onClick={handleStart}>
          {starting ? t('lobby.starting') : lobby.canStart ? t('lobby.startGame') : t('lobby.waitingForTwo')}
        </button>
      ) : (
        <p className="lobby-waiting-note">
          {lobby.canStart ? t('lobby.waitingForCreatorToStart', lobby.createdByName) : t('lobby.waitingForTwo')}
        </p>
      )}

      {isCreator && (
        <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={handleCancelGame} disabled={cancelling}>
          {cancelling ? t('lobby.cancelling') : t('lobby.cancelGame')}
        </button>
      )}
    </div>
  );
}
