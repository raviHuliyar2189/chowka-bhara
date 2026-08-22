import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from './socket';
import type { GameState } from '../game/turnEngine';
import { moverOfLastMove } from '../game/turnEngine';
import { computePlacements } from '../game/session';
import type { PlayerId } from '../game/paths';
import Board from '../components/Board';
import DiceTray from '../components/DiceTray';
import ReportBugModal from '../components/ReportBugModal';
import OnlineAbortModal, { type AbortUIState } from './OnlineAbortModal';
import { announceRoll, announceCapture, announceFinish, announceHint, setAnnouncerEnabled } from '../audio/announcer';

interface Props {
  gameId: string;
  initialState: GameState;
  mySeat: PlayerId;
  onAborted: () => void;
}

interface AbortPendingPayload {
  requestedBy: PlayerId;
  activeSeats: PlayerId[];
  votes: Record<string, boolean>;
}

// Online-mode gameplay screen — reuses the exact same Board/DiceTray components the local
// hotseat game uses, just driven by the server's broadcast state instead of a local reducer.
// Every action (roll, pick a value, pick a piece, rollback) is sent to the server over the
// socket and applied there; this component only ever renders whatever comes back.
export default function OnlinePlay({ gameId, initialState, mySeat, onAborted }: Props) {
  const [game, setGame] = useState<GameState>(initialState);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [showReportBug, setShowReportBug] = useState(false);
  const [abortUI, setAbortUI] = useState<AbortUIState | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // The player roster (id/name pairs) never changes once a game starts — removePlayers marks
  // players as having lost, it doesn't remove them from the array — so the initial prop is a
  // stable, always-current source for seat -> name lookups in the abort event handlers below.
  function nameFor(seat: string): string {
    return initialState.players.find((p) => p.id === seat)?.name ?? seat;
  }

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;
    socket.emit('join-lobby-room', { gameId });
    socket.on('game-updated', (state: GameState) => setGame(state));

    socket.on('abort:pending', ({ activeSeats, votes }: AbortPendingPayload) => {
      if (!activeSeats.includes(mySeat)) {
        setAbortUI(null);
        return;
      }
      if (mySeat in votes) {
        const waitingOnNames = activeSeats.filter((s) => !(s in votes)).map(nameFor);
        setAbortUI({ kind: 'waiting', waitingOnNames });
      } else {
        setAbortUI({ kind: 'prompt' });
      }
    });
    socket.on('abort:forfeit-needed', ({ requestedBy, declineCount }: { requestedBy: PlayerId; declineCount: number }) => {
      setAbortUI(
        requestedBy === mySeat
          ? { kind: 'forfeit-decision', declineCount }
          : { kind: 'awaiting-decision', decidedByName: nameFor(requestedBy) }
      );
    });
    socket.on('abort:resolved', ({ action }: { action: 'abort' | 'resume' | 'forfeit' }) => {
      setAbortUI(null);
      if (action === 'abort') onAborted();
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint?.key]);

  useEffect(() => {
    if (game.rollHistory.length === 0) return;
    const last = game.rollHistory[game.rollHistory.length - 1];
    announceRoll(last.label, last.value, last.isBonus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.rollHistory.length]);

  useEffect(() => {
    if (game.eventSeq === 0) return;
    announceCapture(game.lastCapturePlayer, game.lastCaptureCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.eventSeq]);

  useEffect(() => {
    if (game.rankings.length === 0) return;
    const lastId = game.rankings[game.rankings.length - 1];
    const finisher = game.players.find((p) => p.id === lastId);
    if (finisher) announceFinish(finisher.name, game.rankings.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.rankings.length]);

  function handleRoll() {
    socketRef.current?.emit('game:roll', { gameId });
  }
  function handleSelectValue(index: number) {
    socketRef.current?.emit('game:select-value', { gameId, index });
  }
  function handleSelectPiece(pieceId: number) {
    socketRef.current?.emit('game:select-piece', { gameId, pieceId });
  }
  function handleRollback() {
    socketRef.current?.emit('game:rollback', { gameId });
  }
  function handlePieceClickedBeforeValue() {
    const text = 'ಮೊದಲು ಗರ ಆಯ್ಕೆಮಾಡಿ.';
    announceHint(text);
    setHint({ text, key: Date.now() });
  }
  function handleAbortRequest() {
    socketRef.current?.emit('abort:request', { gameId });
  }
  function handleAbortRespond(agree: boolean) {
    socketRef.current?.emit('abort:respond', { gameId, agree });
  }
  function handleForfeitDecision(forfeit: boolean) {
    socketRef.current?.emit('abort:forfeit-decision', { gameId, forfeit });
  }
  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setAnnouncerEnabled(next);
  }

  if (game.phase === 'game-over') {
    const placements = computePlacements(game);
    return (
      <div className="setup-inline">
        <div className="modal">
          <h2>Game Over!</h2>
          <ol>
            {placements.map((p) => (
              <li key={p.playerId}>
                <strong>{p.name}</strong> — {p.isLoss ? 'Loss' : `Place ${p.place}`}
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  const isMyTurn = game.players[game.currentTurnIndex].id === mySeat;
  const lastMover = moverOfLastMove(game);
  const showRollback = lastMover !== null && lastMover.id === mySeat;

  return (
    <div className="container">
      <div className="board-container">
        {game.eventSeq > 0 && (
          <div key={game.eventSeq} className="capture-toast">
            {game.lastCapturePlayer} captured {game.lastCaptureCount}{' '}
            piece{game.lastCaptureCount === 1 ? '' : 's'}!
          </div>
        )}
        <Board
          game={game}
          onSelectPiece={handleSelectPiece}
          onSelectStats={() => {}}
          onPieceClickedBeforeValue={handlePieceClickedBeforeValue}
          viewerSeat={mySeat}
        />
      </div>
      <div className="play-area">
        <div className={`announcer${hint ? ' announcer-hint' : ''}`}>{hint ? hint.text : game.message}</div>
        <DiceTray
          game={game}
          onRoll={handleRoll}
          onSelectValue={handleSelectValue}
          showRollback={showRollback}
          onRollback={handleRollback}
          isMyTurn={isMyTurn}
        />
        <div className="post-dice-actions">
          <button className="action-btn btn-abort" onClick={handleAbortRequest} disabled={abortUI !== null}>
            Abort Game
          </button>
          <button className="btn-debug-log" onClick={() => setShowReportBug(true)} title="Report a bug">
            🐞 Report Bug
          </button>
          <button
            className={`btn-sound in-game-sound ${soundOn ? 'is-on' : 'is-off'}`}
            onClick={toggleSound}
            title={soundOn ? 'Mute announcements' : 'Unmute announcements'}
          >
            {soundOn ? '🔊 Sound On' : '🔇 Muted'}
          </button>
        </div>
      </div>

      {abortUI && (
        <OnlineAbortModal state={abortUI} onRespond={handleAbortRespond} onForfeitDecision={handleForfeitDecision} />
      )}
      {showReportBug && <ReportBugModal debugLog={game.debugLog} onClose={() => setShowReportBug(false)} />}
    </div>
  );
}
