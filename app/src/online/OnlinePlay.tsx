import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from './socket';
import type { GameState } from '../game/turnEngine';
import { moverOfLastMove } from '../game/turnEngine';
import { computePlacements } from '../game/session';
import type { PlayerId } from '../game/paths';
import Board from '../components/Board';
import DiceTray from '../components/DiceTray';
import { announceRoll, announceCapture, announceFinish, announceHint } from '../audio/announcer';

interface Props {
  gameId: string;
  initialState: GameState;
  mySeat: PlayerId;
}

// Online-mode gameplay screen — reuses the exact same Board/DiceTray components the local
// hotseat game uses, just driven by the server's broadcast state instead of a local reducer.
// Every action (roll, pick a value, pick a piece, rollback) is sent to the server over the
// socket and applied there; this component only ever renders whatever comes back.
export default function OnlinePlay({ gameId, initialState, mySeat }: Props) {
  const [game, setGame] = useState<GameState>(initialState);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;
    socket.emit('join-lobby-room', { gameId });
    socket.on('game-updated', (state: GameState) => setGame(state));
    return () => {
      socket.disconnect();
    };
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
      </div>
    </div>
  );
}
