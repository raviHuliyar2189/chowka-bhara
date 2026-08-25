import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
  waitForAnnouncer,
} from '../audio/announcer';
import { useT } from '../i18n/strings';
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
// A floor on the pause before every step of the computer's turn (roll, then move) — the actual
// wait is whichever is longer of this and the previous step's announcement actually finishing
// (see waitForAnnouncer in announcer.ts), so a short announcement still gets this minimum pacing
// and a longer one (e.g. a bonus-roll or capture sentence) is never cut off by firing the next
// action too early.
const AI_MOVE_DELAY_MS = 2000;

type SessionEntry = { players: string[]; placements: PlacementEntry[] };

export default function VsComputerPage() {
  const t = useT();
  const navigate = useNavigate();
  const [humanName, setHumanName] = useState('');
  const [game, setGame] = useState<GameState | null>(null);
  const [stats, setStats] = useState<Record<string, PlayerStats>>(() => loadStats());
  const [sessionResults, setSessionResults] = useState<SessionEntry[]>([]);
  const [showReportBug, setShowReportBug] = useState(false);
  const [showResults, setShowResults] = useState(false);
  // Distinguishes an abort from a natural finish while showResults is true — both now offer the
  // same Rematch/New Game choice (see ResultsModal's aborted prop), rather than abort silently
  // dropping straight back to the name-entry screen with no way to quickly play again.
  const [resultsAborted, setResultsAborted] = useState(false);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  // See HotseatPage.tsx's own copy of these two for why they exist — banner mirrors the same
  // triggers as the spoken announcements, and prevRankingIds lets the finish effect tell exactly
  // which id(s) are newly ranked (and skip forfeits/eliminations) since insertIntoRankings can
  // insert a finish ahead of an earlier removal, not just at the array's end.
  const [banner, setBanner] = useState('');
  const prevRevertSeq = useRef(0);
  const prevRankingIds = useRef<PlayerId[]>([]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint?.key]);

  useEffect(() => {
    if (!game || game.rollHistory.length === 0) return;
    const last = game.rollHistory[game.rollHistory.length - 1];
    const name = game.players[game.currentTurnIndex].name;
    announceRoll(name, last.label, last.isBonus);
    setBanner(last.isBonus ? t('banner.rollBonus', name, last.label) : t('banner.rollResult', name, last.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rollHistory.length]);

  useEffect(() => {
    if (!game || game.phase !== 'awaiting-roll') return;
    const name = game.players[game.currentTurnIndex].name;
    if (game.revertSeq !== prevRevertSeq.current) {
      announceTurnReverted(game.lastRevertedPlayer, name);
      setBanner(t('banner.turnReverted', game.lastRevertedPlayer, name));
    } else {
      announceTurnStart(name);
      setBanner(t('banner.turnStart', name));
    }
    prevRevertSeq.current = game.revertSeq;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.currentTurnIndex, game?.revertSeq]);

  useEffect(() => {
    if (!game || game.eventSeq === 0) return;
    announceCapture(game.lastCapturePlayer, game.lastCaptureCount);
    setBanner(t('banner.captured', game.lastCapturePlayer, game.lastCaptureCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.eventSeq]);

  useEffect(() => {
    if (!game) return;
    const prevIds = prevRankingIds.current;
    const newIds = game.rankings.filter((id) => !prevIds.includes(id));
    prevRankingIds.current = game.rankings;
    for (const id of newIds) {
      const player = game.players.find((p) => p.id === id);
      if (!player || player.hasLost) continue;
      const place = game.rankings.indexOf(id) + 1;
      announceFinish(player.name, place);
      setBanner(place === 1 ? t('banner.won', player.name) : t('banner.finished', player.name, place));
    }
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
    prevRevertSeq.current = 0;
    prevRankingIds.current = [];
    setBanner(t('banner.turnStart', name));
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
    const text = t('hint.selectValueFirst');
    announceHint('hint.selectValueFirst');
    setHint({ text, key: Date.now() });
  }

  // No AbortModal cycling here — with only one real person to ask, clicking Abort just ends the
  // game immediately, unlike hotseat's multi-player consensus flow. Keeps `game` around (rather
  // than nulling it) and shows the same Rematch/New Game choice a natural finish does, instead of
  // dropping straight back to the name-entry screen.
  function handleAbort() {
    if (!game) return;
    const updatedStats = applyAbortToStats(
      stats,
      game.players.map((p) => p.name)
    );
    setStats(updatedStats);
    saveStats(updatedStats);
    setSessionResults((prev) => [...prev, { players: game.players.map((p) => p.name), placements: [] }]);
    setResultsAborted(true);
    setShowResults(true);
  }

  function handleRematch() {
    if (!game) return;
    setShowResults(false);
    setResultsAborted(false);
    prevRevertSeq.current = 0;
    prevRankingIds.current = [];
    const next = rematch(game);
    setBanner(t('banner.turnStart', next.players[next.currentTurnIndex].name));
    setGame(next);
  }
  // Returns all the way to mode-select (not just this mode's own name-entry screen) so the player
  // can pick from every option — a different mode entirely, not just another vs-computer game.
  function handleNewSession() {
    navigate('/');
  }

  // Drives the computer's turn automatically, reusing the exact same reducer calls the human's
  // own buttons use — chooseAiMove decides what a human would otherwise click. A bonus roll or a
  // capture naturally re-triggers this same effect (pool/rollHistory length changes), so chained
  // bonus rolls and post-capture rerolls need no special casing.
  useEffect(() => {
    if (!game || game.phase === 'game-over') return;
    if (game.players[game.currentTurnIndex].id !== AI_SEAT) return;

    let cancelled = false;
    Promise.all([
      new Promise((resolve) => setTimeout(resolve, AI_MOVE_DELAY_MS)),
      waitForAnnouncer(),
    ]).then(() => {
      if (cancelled) return;
      if (game.phase === 'awaiting-roll') {
        handleRoll();
      } else if (game.phase === 'awaiting-selection') {
        const move = chooseAiMove(game, AI_SEAT);
        if (move) {
          const afterValue = selectPoolValue(game, move.poolIndex);
          endGameIfOver(selectPiece(afterValue, move.pieceId));
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.currentTurnIndex, game?.phase, game?.pool.length, game?.rollHistory.length]);

  if (!game) {
    return (
      <div className="setup-inline">
        <div className="modal">
          <h2>{t('vsComputer.title')}</h2>
          <form onSubmit={handleStart}>
            <div className="setup-row">
              <label className="setup-label" htmlFor="humanName">
                {t('vsComputer.yourName')}
              </label>
              <input
                id="humanName"
                required
                value={humanName}
                onChange={(e) => setHumanName(e.target.value)}
                placeholder={t('vsComputer.namePlaceholder')}
                maxLength={40}
              />
            </div>
            <button className="action-btn btn-start" type="submit">
              {t('setup.startGame')}
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
              {t('game.captureToast', game.lastCapturePlayer, game.lastCaptureCount)}
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
          <div className={`announcer${hint ? ' announcer-hint' : ''}`}>{hint ? hint.text : banner}</div>
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
              {t('game.abortButton')}
            </button>
            <button className="btn-debug-log" onClick={() => setShowReportBug(true)} title={t('game.reportBugTitle')}>
              {t('game.reportBug')}
            </button>
            <button
              className={`btn-sound in-game-sound ${soundOn ? 'is-on' : 'is-off'}`}
              onClick={toggleSound}
              title={soundOn ? t('setup.muteTitle') : t('setup.unmuteTitle')}
            >
              {soundOn ? t('game.soundOn') : t('game.muted')}
            </button>
          </div>
        </div>
      </div>

      {showReportBug && <ReportBugModal debugLog={game.debugLog} onClose={() => setShowReportBug(false)} />}

      {statsFor && <StatsModal name={statsFor} stats={stats[statsFor]} onClose={() => setStatsFor(null)} />}

      {showResults && (
        <ResultsModal
          placements={resultsAborted ? [] : computePlacements(game)}
          aborted={resultsAborted}
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
