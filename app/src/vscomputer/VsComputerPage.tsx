import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlayerId } from '../game/paths';
import {
  type GameState,
  createGame,
  roll,
  selectPoolValue,
  selectPiece,
  formGattiMove,
  removePlayers,
  rematch,
  checkStuckPool,
} from '../game/turnEngine';
import { hasAnyLegalMove } from '../game/rules';
import { computePlacements, applyPlacementsToStats, type PlacementEntry } from '../game/session';
import { loadStats, saveStats, type PlayerStats } from '../game/storage';
import { AI_SEAT, AI_NAME } from '../game/aiOpponent';
import { chooseAiMove } from '../game/ai';
import {
  announceRoll,
  announceTurnStart,
  announceTurnReverted,
  announceCapture,
  announceFinish,
  announceGattiFormed,
  announceHint,
  announceStuckPool,
  setAnnouncerEnabled,
  waitForAnnouncer,
} from '../audio/announcer';
import { useT } from '../i18n/strings';
import { setChromeHidden } from '../ui/appChrome';
import Board from '../components/Board';
import DiceTray from '../components/DiceTray';
import AppControlsPanel from '../components/AppControlsMenu';
import ResignModal from '../components/ResignModal';
import ReportBugModal from '../components/ReportBugModal';
import StatsModal from '../components/StatsModal';
import ResultsModal from '../components/ResultsModal';

// Always exactly 2 seats, opposite bases, matching the existing 2-player convention. AI_SEAT/
// AI_NAME are shared with hotseat/Develop Test's own "1 player" option and the online server's
// AI-driving code (see aiOpponent.ts) so none of them can ever drift apart on what "the computer"
// means.
const HUMAN_SEAT: PlayerId = 'P1';
const COLORS: Record<PlayerId, string> = { P1: '#b03a2e', P2: '#2e5f8a', P3: '#3f7d4f', P4: '#c07a12' };
// A floor on the pause before every step of the computer's turn (roll, then move) — the actual
// wait is whichever is longer of this and the previous step's announcement actually finishing
// (see waitForAnnouncer in announcer.ts), so a short announcement still gets this minimum pacing
// and a longer one (e.g. a bonus-roll or capture sentence) is never cut off by firing the next
// action too early.
const AI_MOVE_DELAY_MS = 2000;
// How long a stuck pool (no legal move left for either player to play — e.g. one piece or one
// gatti left and the value can't move it) stays visible, banner and all, before the turn actually
// reverts. See HotseatPage.tsx's own copy of this constant/effect for the full reasoning.
const STUCK_POOL_DELAY_MS = 2000;

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
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [resignAllowed, setResignAllowed] = useState(false);
  // Purely informational — resigning is unconditional, same as hotseat/online's own copy of this
  // state. Gates the results screen the same way OnlinePlay.tsx does, so the notice always shows
  // before the placements (relevant here since resigning the sole human always ends the game).
  const [resignedPlayerName, setResignedPlayerName] = useState<string | null>(null);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  // See HotseatPage.tsx's own copy of these two for why they exist — banner mirrors the same
  // triggers as the spoken announcements, and prevRankingIds lets the finish effect tell exactly
  // which id(s) are newly ranked (and skip forfeits/eliminations) since insertIntoRankings can
  // insert a finish ahead of an earlier removal, not just at the array's end.
  const [banner, setBanner] = useState('');
  const prevRevertSeq = useRef(0);
  const prevRankingIds = useRef<PlayerId[]>([]);

  // See HotseatPage.tsx's own copy of this for the full reasoning — hides the global app header
  // while the board is on screen, restored on unmount.
  useEffect(() => {
    setChromeHidden(!!game);
    return () => setChromeHidden(false);
    // Deliberately keyed on the boolean, not `game` itself — that object's identity changes on
    // every single move/roll, which would tear down and re-run this effect (and its listener
    // churn) far more often than the true/false transition it actually cares about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!game]);

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

  // Fires whenever the pool (just rolled, or just left over after a move) turns out to have no
  // legal move for anyone left to play it — see HotseatPage.tsx's own copy of this effect for the
  // full reasoning (same delayed-revert pattern, since this mode is also client-driven).
  useEffect(() => {
    if (!game || game.phase !== 'awaiting-selection' || game.pool.length === 0) return;
    const player = game.players[game.currentTurnIndex];
    if (hasAnyLegalMove(game.players, player, game.pool)) return;
    announceStuckPool(player.name);
    setBanner(t('banner.noLegalMove', player.name));
    const timer = setTimeout(() => {
      endGameIfOver(checkStuckPool(game));
    }, STUCK_POOL_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.phase, game?.pool.length, game?.currentTurnIndex]);

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
    if (!game || game.gattiSeq === 0) return;
    announceGattiFormed(game.lastGattiPlayer);
    setBanner(t('banner.gattiFormed', game.lastGattiPlayer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.gattiSeq]);

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

  function endGameIfOver(next: GameState, resignedNames: string[] = []) {
    setGame(next);
    if (next.phase === 'game-over') {
      const placements = computePlacements(next);
      // Always seatCount 1 — Vs Computer is the single-player experience by construction (§10's
      // games1p bucket), regardless of the real 2-seat engine state underneath.
      const updatedStats = applyPlacementsToStats(stats, placements, 1, resignedNames);
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
  function handleFormGatti(pos: number) {
    if (game) endGameIfOver(formGattiMove(game, pos));
  }
  function handlePieceClickedBeforeValue() {
    const text = t('hint.selectValueFirst');
    announceHint('hint.selectValueFirst');
    setHint({ text, key: Date.now() });
  }

  // Same unconditional semantics as hotseat's own Resign (§9) — the only real decision-maker here
  // is the human, so this always resigns HUMAN_SEAT specifically rather than "whoever's turn it
  // currently is" (hotseat's rule, meaningful there since multiple humans share one device).
  // Reuses the exact same removePlayers forfeit path — since only the AI remains active afterward,
  // it ends the game the same way any single-survivor forfeit does, landing on the normal
  // placements screen (no separate "aborted" outcome) once the resign notice is dismissed.
  function handleResign() {
    if (!game) return;
    const human = game.players.find((p) => p.id === HUMAN_SEAT)!;
    setResignedPlayerName(human.name);
    endGameIfOver(removePlayers(game, [HUMAN_SEAT]), [human.name]);
  }

  function handleRematch() {
    if (!game) return;
    setShowResults(false);
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
          if (move.kind === 'move') {
            endGameIfOver(selectPiece(afterValue, move.pieceId));
          } else {
            endGameIfOver(formGattiMove(afterValue, move.pos));
          }
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
            <div className="sound-prompt">
              <div className="sound-prompt-question">{t('setup.resignAllowedQuestion')}</div>
              <button
                type="button"
                className={`btn-sound ${resignAllowed ? 'is-on' : 'is-off'}`}
                onClick={() => setResignAllowed((v) => !v)}
                title={resignAllowed ? t('setup.resignDisableTitle') : t('setup.resignEnableTitle')}
              >
                {resignAllowed ? t('setup.resignOn') : t('setup.resignOff')}
              </button>
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
            onFormGatti={handleFormGatti}
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
            resignAllowed={resignAllowed}
            onResign={handleResign}
          />
          <AppControlsPanel soundOn={soundOn} onToggleSound={toggleSound} onReportBug={() => setShowReportBug(true)} />
        </div>
      </div>

      {resignedPlayerName && (
        <ResignModal playerName={resignedPlayerName} onDismiss={() => setResignedPlayerName(null)} />
      )}

      {showReportBug && (
        <ReportBugModal mode="vs-computer" gameId={null} debugLog={game.debugLog} onClose={() => setShowReportBug(false)} />
      )}

      {statsFor && <StatsModal name={statsFor} stats={stats[statsFor]} onClose={() => setStatsFor(null)} />}

      {!resignedPlayerName && showResults && (
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
