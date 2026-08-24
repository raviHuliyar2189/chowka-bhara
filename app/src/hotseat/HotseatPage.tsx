import { useEffect, useRef, useState } from 'react';
import type { PlayerId } from '../game/paths';
import {
  type GameState,
  createGame,
  roll,
  selectPoolValue,
  selectPiece,
  removePlayers,
  rematch,
  rollbackLastMove,
} from '../game/turnEngine';
import { computePlacements, applyPlacementsToStats, applyAbortToStats, type PlacementEntry } from '../game/session';
import { loadRoster, saveRoster, loadStats, saveStats, type PlayerStats } from '../game/storage';
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
import SetupModal from '../components/SetupModal';
import AbortModal from '../components/AbortModal';
import ReportBugModal from '../components/ReportBugModal';
import StatsModal from '../components/StatsModal';
import ResultsModal from '../components/ResultsModal';

const COLORS: Record<PlayerId, string> = {
  P1: '#b03a2e',
  P2: '#2e5f8a',
  P3: '#3f7d4f',
  P4: '#c07a12',
};

export interface SetupPlayer {
  id: PlayerId;
  name: string;
}

type SessionEntry = { players: string[]; placements: PlacementEntry[] };

export default function HotseatPage() {
  const [inSetup, setInSetup] = useState(true);
  const [game, setGame] = useState<GameState | null>(null);
  const [roster, setRoster] = useState<string[]>(() => loadRoster());
  const [stats, setStats] = useState<Record<string, PlayerStats>>(() => loadStats());
  const [sessionResults, setSessionResults] = useState<SessionEntry[]>([]);
  const [showAbort, setShowAbort] = useState(false);
  const [showReportBug, setShowReportBug] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [rollbackEnabled, setRollbackEnabled] = useState(false);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  // Tracks the last-seen revertSeq so the turn-start effect below can tell a normal turn advance
  // apart from one caused by a revert (both change currentTurnIndex in the same update) without
  // racing two separate speak() calls against each other (speak() always cancels-and-replaces,
  // so whichever effect fired second would silently cut off the first).
  const prevRevertSeq = useRef(0);

  // Narrow deps deliberately: this should reset exactly once per new hint (keyed), not re-fire
  // on unrelated renders while a hint is showing.
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint?.key]);

  // Deliberately narrow deps: each effect should announce exactly once per new roll / capture /
  // finish, keyed on the counter that changes for that event — not on every game state change,
  // which would re-announce the same event repeatedly on unrelated updates.
  useEffect(() => {
    if (!game || game.rollHistory.length === 0) return;
    const last = game.rollHistory[game.rollHistory.length - 1];
    announceRoll(game.players[game.currentTurnIndex].name, last.label, last.isBonus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rollHistory.length]);

  // Spoken immediately when a new turn begins (not just after the 5s idle nudge) — keyed on
  // currentTurnIndex so it fires once per turn change, including the very first turn on mount.
  // If this turn change was caused by a revert (stuck pool / finish-with-leftover-dice), that
  // gets its own combined announcement instead — see prevRevertSeq's own comment above.
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

  function appendLog(line: string) {
    setGame((prev) => (prev ? { ...prev, debugLog: [...prev.debugLog, line] } : prev));
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setAnnouncerEnabled(next);
    appendLog(`Sound turned ${next ? 'on' : 'off'}`);
  }

  function toggleRollback() {
    setRollbackEnabled((v) => !v);
  }
  function handleRollback() {
    // Never roll back a move that already ended the game — stats/session results from that
    // ending have already been recorded (see endGameIfOver) and can't be cleanly un-recorded.
    if (game && game.phase !== 'game-over') setGame(rollbackLastMove(game));
  }

  function handleStart(players: SetupPlayer[]) {
    const nextRoster = Array.from(new Set([...roster, ...players.map((p) => p.name)]));
    setRoster(nextRoster);
    saveRoster(nextRoster);
    setGame(createGame(players.map((p) => ({ id: p.id, name: p.name, color: COLORS[p.id] }))));
    setInSetup(false);
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
    appendLog('User clicked a piece before selecting a pool value');
  }
  function handleOpenAbort() {
    appendLog('User requested to abort the game');
    setShowAbort(true);
  }
  function handleAbortResolved(action: 'abort' | 'resume' | 'forfeit', losers?: PlayerId[]) {
    setShowAbort(false);
    if (!game) return;
    if (action === 'abort') {
      // No point logging into game.debugLog here — game is about to be nulled out below in
      // this same handler, so the entry would never be visible to copy.
      const updatedStats = applyAbortToStats(
        stats,
        game.players.map((p) => p.name)
      );
      setStats(updatedStats);
      saveStats(updatedStats);
      setGame(null);
      setInSetup(true);
    } else if (action === 'forfeit' && losers) {
      endGameIfOver(removePlayers(game, losers));
    } else if (action === 'resume') {
      appendLog('Abort declined — game resumes');
    }
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
    setInSetup(true);
  }

  return (
    <div className="app-frame">
      {inSetup && (
        <SetupModal
          roster={roster}
          onStart={handleStart}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          rollbackEnabled={rollbackEnabled}
          onToggleRollback={toggleRollback}
        />
      )}

      {!inSetup && game && (
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
            />
          </div>
          <div className="play-area">
            <div className={`announcer${hint ? ' announcer-hint' : ''}`}>{hint ? hint.text : game.message}</div>
            <DiceTray
              game={game}
              onRoll={handleRoll}
              onSelectValue={handleSelectValue}
              showRollback={rollbackEnabled && !!game.lastMoveSnapshot && game.phase !== 'game-over'}
              onRollback={handleRollback}
            />
            <div className="post-dice-actions">
              <button className="action-btn btn-abort" onClick={handleOpenAbort}>
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
      )}

      {showAbort && game && <AbortModal players={game.players} onResolve={handleAbortResolved} />}

      {showReportBug && game && (
        <ReportBugModal debugLog={game.debugLog} onClose={() => setShowReportBug(false)} />
      )}

      {statsFor && <StatsModal name={statsFor} stats={stats[statsFor]} onClose={() => setStatsFor(null)} />}

      {showResults && game && (
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
