import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PlayerId } from '../game/paths';
import {
  type GameState,
  createGame,
  roll,
  selectPoolValue,
  selectPiece,
  rematch,
} from '../game/turnEngine';
import { computePlacements, applyPlacementsToStats, applyAbortToStats, type PlacementEntry } from '../game/session';
import { loadStats, saveStats, type PlayerStats } from '../game/storage';
import { chooseAiMove } from '../game/ai';
import {
  announceRoll,
  announceTurnStart,
  announceTurnReverted,
  announceCapture,
  announceFinish,
  announceHint,
  setAnnouncerEnabled,
} from '../audio/announcer';
import Board from '../components/Board';
import DiceTray from '../components/DiceTray';
import ReportBugModal from '../components/ReportBugModal';
import StatsModal from '../components/StatsModal';
import ResultsModal from '../components/ResultsModal';

// Always exactly 2 seats, opposite bases, matching the existing 2-player convention.
const HUMAN_SEAT: PlayerId = 'P1';
const AI_SEAT: PlayerId = 'P3';
const AI_NAME = 'Computer';
const COLORS: Record<PlayerId, string> = { P1: '#b03a2e', P2: '#2e5f8a', P3: '#3f7d4f', P4: '#c07a12' };
// Applied before every step of the computer's turn (roll, then move) — since each step is
// announced (below), this doubles as "give the human time to hear the previous announcement
// before the next thing happens," not just a generic pacing delay.
const AI_MOVE_DELAY_MS = 2000;

type SessionEntry = { players: string[]; placements: PlacementEntry[] };

export default function VsComputerPage() {
  const [humanName, setHumanName] = useState('');
  const [game, setGame] = useState<GameState | null>(null);
  const [stats, setStats] = useState<Record<string, PlayerStats>>(() => loadStats());
  const [sessionResults, setSessionResults] = useState<SessionEntry[]>([]);
  const [showReportBug, setShowReportBug] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  // See HotseatPage.tsx's identical field for why this exists — tells a normal turn advance apart
  // from one caused by a revert without racing two speak() calls against each other.
  const prevRevertSeq = useRef(0);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint?.key]);

  useEffect(() => {
    if (!game || game.rollHistory.length === 0) return;
    const last = game.rollHistory[game.rollHistory.length - 1];
    announceRoll(game.players[game.currentTurnIndex].name, last.label, last.isBonus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rollHistory.length]);

  useEffect(() => {
    if (!game || game.phase !== 'awaiting-roll') return;
    if (game.revertSeq !== prevRevertSeq.current) {
      announceTurnReverted(game.lastRevertedPlayer, game.players[game.currentTurnIndex].name);
    } else {
      announceTurnStart(game.players[game.currentTurnIndex].name, true);
    }
    prevRevertSeq.current = game.revertSeq;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.currentTurnIndex, game?.revertSeq]);

  useEffect(() => {
    if (!game || game.eventSeq === 0) return;
    announceCapture(game.lastCapturePlayer, game.lastCaptureCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.eventSeq]);

  useEffect(() => {
    if (!game || game.rankings.length === 0) return;
    const lastId = game.rankings[game.rankings.length - 1];
    const finisher = game.players.find((p) => p.id === lastId);
    if (finisher) announceFinish(finisher.name, game.rankings.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rankings.length]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setAnnouncerEnabled(next);
  }

  function handleStart(e: FormEvent) {
    e.preventDefault();
    const name = humanName.trim();
    if (!name) return;
    setGame(
      createGame([
        { id: HUMAN_SEAT, name, color: COLORS[HUMAN_SEAT] },
        { id: AI_SEAT, name: AI_NAME, color: COLORS[AI_SEAT] },
      ])
    );
  }

  function endGameIfOver(next: GameState) {
    setGame(next);
    if (next.phase === 'game-over') {
      const placements = computePlacements(next);
      const updatedStats = applyPlacementsToStats(stats, placements);
      setStats(updatedStats);
      saveStats(updatedStats);
      setSessionResults((prev) => [...prev, { players: next.players.map((p) => p.name), placements }]);
      setShowResults(true);
    }
  }

  function handleRoll() {
    if (game) endGameIfOver(roll(game));
  }
  function handleSelectValue(i: number) {
    if (game) setGame(selectPoolValue(game, i));
  }
  function handleSelectPiece(pieceId: number) {
    if (game) endGameIfOver(selectPiece(game, pieceId));
  }
  function handlePieceClickedBeforeValue() {
    announceHint('Select a dice value first.');
    setHint({ text: 'ಮೊದಲು ಗರ ಆಯ್ಕೆಮಾಡಿ.', key: Date.now() });
  }

  // No AbortModal cycling here — with only one real person to ask, clicking Abort just ends the
  // game immediately, unlike hotseat's multi-player consensus flow.
  function handleAbort() {
    if (!game) return;
    const updatedStats = applyAbortToStats(
      stats,
      game.players.map((p) => p.name)
    );
    setStats(updatedStats);
    saveStats(updatedStats);
    setGame(null);
  }

  function handleRematch() {
    if (!game) return;
    setShowResults(false);
    setGame(rematch(game));
  }
  function handleNewSession() {
    setShowResults(false);
    setGame(null);
    setSessionResults([]);
  }

  // Drives the computer's turn automatically, reusing the exact same reducer calls the human's
  // own buttons use — chooseAiMove decides what a human would otherwise click. A bonus roll or a
  // capture naturally re-triggers this same effect (pool/rollHistory length changes), so chained
  // bonus rolls and post-capture rerolls need no special casing.
  useEffect(() => {
    if (!game || game.phase === 'game-over') return;
    if (game.players[game.currentTurnIndex].id !== AI_SEAT) return;

    const timer = setTimeout(() => {
      if (game.phase === 'awaiting-roll') {
        handleRoll();
      } else if (game.phase === 'awaiting-selection') {
        const move = chooseAiMove(game, AI_SEAT);
        if (move) {
          const afterValue = selectPoolValue(game, move.poolIndex);
          endGameIfOver(selectPiece(afterValue, move.pieceId));
        }
      }
    }, AI_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.currentTurnIndex, game?.phase, game?.pool.length, game?.rollHistory.length]);

  if (!game) {
    return (
      <div className="setup-inline">
        <div className="modal">
          <h2>Play vs Computer</h2>
          <form onSubmit={handleStart}>
            <div className="setup-row">
              <label className="setup-label" htmlFor="humanName">
                Your Name:
              </label>
              <input
                id="humanName"
                required
                value={humanName}
                onChange={(e) => setHumanName(e.target.value)}
                placeholder="e.g. Ravi"
                maxLength={40}
              />
            </div>
            <button className="action-btn btn-start" type="submit">
              Start Game
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-frame">
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
            onSelectStats={setStatsFor}
            onPieceClickedBeforeValue={handlePieceClickedBeforeValue}
            viewerSeat={HUMAN_SEAT}
          />
        </div>
        <div className="play-area">
          <div className={`announcer${hint ? ' announcer-hint' : ''}`}>{hint ? hint.text : game.message}</div>
          <DiceTray
            game={game}
            onRoll={handleRoll}
            onSelectValue={handleSelectValue}
            showRollback={false}
            onRollback={() => {}}
            isMyTurn={game.players[game.currentTurnIndex].id === HUMAN_SEAT}
          />
          <div className="post-dice-actions">
            <button className="action-btn btn-abort" onClick={handleAbort}>
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
      </div>

      {showReportBug && <ReportBugModal debugLog={game.debugLog} onClose={() => setShowReportBug(false)} />}

      {statsFor && <StatsModal name={statsFor} stats={stats[statsFor]} onClose={() => setStatsFor(null)} />}

      {showResults && (
        <ResultsModal
          placements={computePlacements(game)}
          sessionResults={sessionResults}
          stats={stats}
          onRematch={handleRematch}
          onNewSession={handleNewSession}
          onShowStats={setStatsFor}
        />
      )}
    </div>
  );
}
