import { useEffect, useRef, useState } from 'react';
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
  rollbackLastMove,
  checkStuckPool,
} from '../game/turnEngine';
import { hasAnyLegalMove } from '../game/rules';
import { computePlacements, applyPlacementsToStats, type PlacementEntry } from '../game/session';
import { loadRoster, saveRoster, loadStats, saveStats, type PlayerStats } from '../game/storage';
import { chooseAiMove } from '../game/ai';
import { AI_SEAT, AI_NAME } from '../game/aiOpponent';
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
import SetupModal from '../components/SetupModal';
import ResignModal from '../components/ResignModal';
import ReportBugModal from '../components/ReportBugModal';
import StatsModal from '../components/StatsModal';
import ResultsModal from '../components/ResultsModal';
import PushToTalkButton from '../components/PushToTalkButton';
import { useVoiceCommands } from '../voice/useVoiceCommands';

const COLORS: Record<PlayerId, string> = {
  P1: '#b03a2e',
  P2: '#2e5f8a',
  P3: '#3f7d4f',
  P4: '#c07a12',
};

// Same pacing as VsComputerPage.tsx's own AI turn — see that file's comment for why it's "whichever
// is longer of this and the announcement actually finishing," not just a fixed delay.
const AI_MOVE_DELAY_MS = 2000;
// How long a stuck pool (no legal move for anyone left to play — e.g. one piece or one gatti left
// and the rolled/remaining value can't move it) stays visible, banner and all, before the turn
// actually reverts and passes to the next player. This used to happen instantly, bundled into the
// same reducer call as the roll/move that caused it — too fast to actually register (a real
// reported bug) — see checkStuckPool's own comment in turnEngine.ts for the full reasoning.
const STUCK_POOL_DELAY_MS = 2000;

export interface SetupPlayer {
  id: PlayerId;
  name: string;
}

type SessionEntry = { players: string[]; placements: PlacementEntry[] };

interface Props {
  // Develop Test mode only: adds a Board Editor screen between setup and play, letting player 1
  // drag pieces to any legal position, manually flag who has already captured, and pick who
  // resumes first. Defaults to false so plain /hotseat is completely unaffected.
  allowCustomSetup?: boolean;
}

export default function HotseatPage({ allowCustomSetup = false }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const [inSetup, setInSetup] = useState(true);
  const [game, setGame] = useState<GameState | null>(null);
  const [editorState, setEditorState] = useState<GameState | null>(null);
  const [resumeAsSeat, setResumeAsSeat] = useState<PlayerId>('P1');
  const [roster, setRoster] = useState<string[]>(() => loadRoster());
  const [stats, setStats] = useState<Record<string, PlayerStats>>(() => loadStats());
  const [sessionResults, setSessionResults] = useState<SessionEntry[]>([]);
  const [resignedPlayerName, setResignedPlayerName] = useState<string | null>(null);
  const [resignedIds, setResignedIds] = useState<PlayerId[]>([]);
  const [showReportBug, setShowReportBug] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [rollbackEnabled, setRollbackEnabled] = useState(true);
  const [resignAllowed, setResignAllowed] = useState(false);
  // Set only when setup was given exactly 1 human player — that seat (see handleStart) is then
  // secretly played by the same AI Vs Computer uses, reusing its exact decision logic. null for
  // every other player count, where every seat is a real human sharing this device as normal.
  const [aiSeat, setAiSeat] = useState<PlayerId | null>(null);
  // The originally-selected player count (1-4, "1" for the solo-vs-AI option) — used only for the
  // games1p/2p/3p/4p stats bucket (§10), tracked separately from `game.players.length` since that
  // would be 2 for a solo-vs-AI game (the AI's own seat included).
  const [seatCount, setSeatCount] = useState(4);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  // The persistent turn banner's current text — replaces reading game.message directly (see
  // i18n/strings.ts: that field is generated inside the language-agnostic game-core reducer and
  // was never one consistent language to begin with). Updated by the same triggers that already
  // drive the spoken announcements below, just rendered instead of spoken.
  const [banner, setBanner] = useState('');
  // Tracks the last-seen revertSeq so the turn-start effect below can tell a normal turn advance
  // apart from one caused by a revert (both change currentTurnIndex in the same update) without
  // racing two separate speak() calls against each other (speak() always cancels-and-replaces,
  // so whichever effect fired second would silently cut off the first).
  const prevRevertSeq = useRef(0);
  // Tracks which player ids were already in game.rankings as of the last render, so the finish
  // effect below can tell exactly which id(s) are newly added (rankings insertion order no longer
  // matches array-append order once a finish can land ahead of an earlier forfeit — see
  // insertIntoRankings in turnEngine.ts) and can skip forfeited/eliminated players entirely (only
  // a genuine finish or the auto-ranked survivor deserves the "finished"/"won" announcement).
  const prevRankingIds = useRef<PlayerId[]>([]);

  // Hides the global app header (App.tsx's AppHeader — language toggle + Sign Out/Exit) for this
  // whole page, not just while the board is showing: the setup screen no longer offers a language
  // toggle at all, and renders its own Sign Out/Exit at the bottom of the modal instead (see
  // SetupModal.tsx) rather than the standalone bar at the very top of the page. Always restored on
  // unmount — leaving another page's header hidden after navigating away would be a real bug, not
  // just a cosmetic one.
  useEffect(() => {
    setChromeHidden(true);
    return () => setChromeHidden(false);
  }, []);

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
    const name = game.players[game.currentTurnIndex].name;
    announceRoll(name, last.label, last.isBonus);
    setBanner(last.isBonus ? t('banner.rollBonus', name, last.label) : t('banner.rollResult', name, last.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rollHistory.length]);

  // Fires whenever the pool (just rolled, or just left over after a move) turns out to have no
  // legal move for anyone left to play it — immediately swaps the banner to say so, then actually
  // reverts the turn after a deliberate pause (see STUCK_POOL_DELAY_MS above) so a player can
  // register what happened instead of the turn instantly passing on. Re-checked on every relevant
  // change (not just once) so it always reflects the current stuck/not-stuck state; the cleanup
  // cancels a pending revert if something else (there normally isn't anything that can, since nothing
  // is clickable while stuck — but the effect re-running itself always tears down its own prior timer).
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

  // Spoken immediately when a new turn begins (not just after the 5s idle nudge) — keyed on
  // currentTurnIndex so it fires once per turn change, including the very first turn on mount.
  // If this turn change was caused by a revert (stuck pool / finish-with-leftover-dice), that
  // gets its own combined announcement instead — see prevRevertSeq's own comment above.
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
      if (!player || player.hasLost) continue; // forfeits/eliminations aren't a "finish"
      const place = game.rankings.indexOf(id) + 1;
      announceFinish(player.name, place);
      setBanner(place === 1 ? t('banner.won', player.name) : t('banner.finished', player.name, place));
    }
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
  function toggleResignAllowed() {
    setResignAllowed((v) => !v);
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
    // "1 player" secretly plays against the same AI Vs Computer uses — added here (after the
    // roster update above, which intentionally only ever sees the real human names entered) so
    // AI_NAME never pollutes the saved roster or the room name picker.
    const isSoloVsAi = players.length === 1;
    setAiSeat(isSoloVsAi ? AI_SEAT : null);
    setSeatCount(players.length);
    const playerDefs = isSoloVsAi
      ? [...players, { id: AI_SEAT, name: AI_NAME }]
      : players;
    const fresh = createGame(playerDefs.map((p) => ({ id: p.id, name: p.name, color: COLORS[p.id] })));
    prevRevertSeq.current = 0;
    prevRankingIds.current = [];
    if (allowCustomSetup) {
      setEditorState(fresh);
      setResumeAsSeat(fresh.players[0].id);
    } else {
      setBanner(t('banner.turnStart', fresh.players[0].name));
      setGame(fresh);
    }
    setInSetup(false);
  }

  // Develop Test mode only — see the Board Editor screen below.
  function handleEditMove(playerId: PlayerId, pieceId: number, newPos: number) {
    setEditorState((prev) =>
      prev
        ? {
            ...prev,
            players: prev.players.map((p) =>
              p.id === playerId
                ? { ...p, pieces: p.pieces.map((pc) => (pc.id === pieceId ? { ...pc, pos: newPos } : pc)) }
                : p
            ),
          }
        : prev
    );
  }
  function handleToggleCaptured(playerId: PlayerId) {
    setEditorState((prev) =>
      prev
        ? { ...prev, players: prev.players.map((p) => (p.id === playerId ? { ...p, hasCaptured: !p.hasCaptured } : p)) }
        : prev
    );
  }
  function handleResetPositions() {
    if (!editorState) return;
    setEditorState(createGame(editorState.players.map((p) => ({ id: p.id, name: p.name, color: p.color }))));
  }
  function handleResumeFromEditor() {
    if (!editorState) return;
    const idx = editorState.players.findIndex((p) => p.id === resumeAsSeat);
    const finalIdx = idx === -1 ? 0 : idx;
    const snapshot = editorState.players.map((p) => ({ ...p, pieces: p.pieces.map((pc) => ({ ...pc })) }));
    prevRevertSeq.current = 0;
    prevRankingIds.current = [];
    setBanner(t('banner.turnStart', editorState.players[finalIdx].name));
    setGame({
      ...editorState,
      currentTurnIndex: finalIdx,
      message: `${editorState.players[finalIdx].name}, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ`,
      turnStartSnapshot: snapshot,
      debugLog: [...editorState.debugLog, `Custom setup: resuming as ${editorState.players[finalIdx].name}`],
    });
    setEditorState(null);
  }

  function endGameIfOver(next: GameState, resignedNames: string[] = []) {
    setGame(next);
    if (next.phase === 'game-over') {
      const placements = computePlacements(next);
      const updatedStats = applyPlacementsToStats(stats, placements, seatCount, resignedNames);
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

  // "1 player" mode only (aiSeat set — see handleStart) — drives that seat's turn automatically,
  // reusing the exact same reducer calls the human's own buttons use. Mirrors
  // VsComputerPage.tsx's own copy of this effect exactly (including its pacing rationale);
  // duplicated rather than shared since the two pages otherwise have little in common structurally
  // (this one also has to coexist with rollback/resign/the Board Editor).
  useEffect(() => {
    if (!aiSeat || !game || game.phase === 'game-over') return;
    if (game.players[game.currentTurnIndex].id !== aiSeat) return;

    let cancelled = false;
    Promise.all([new Promise((resolve) => setTimeout(resolve, AI_MOVE_DELAY_MS)), waitForAnnouncer()]).then(() => {
      if (cancelled) return;
      if (game.phase === 'awaiting-roll') {
        handleRoll();
      } else if (game.phase === 'awaiting-selection') {
        const move = chooseAiMove(game, aiSeat);
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
  }, [aiSeat, game?.currentTurnIndex, game?.phase, game?.pool.length, game?.rollHistory.length]);

  function handlePieceClickedBeforeValue() {
    const text = t('hint.selectValueFirst');
    announceHint('hint.selectValueFirst');
    setHint({ text, key: Date.now() });
    appendLog('User clicked a piece before selecting a pool value');
  }
  // Resigning is unconditional and always applies to whoever's turn it currently is — no vote
  // from the other players, since the resigning player has already made the call themselves.
  // Their pieces come off the board immediately; the Resign Information notice (shown below) is
  // just an acknowledgment for the rest of the table, not a decision point.
  function handleResign() {
    if (!game) return;
    const resigningPlayer = game.players[game.currentTurnIndex];
    setResignedPlayerName(resigningPlayer.name);
    // Computed synchronously (not read back from the `resignedIds` state var, which wouldn't yet
    // reflect this resignation — setState is async) since endGameIfOver needs the complete,
    // up-to-date list of names right now if this resignation happens to end the game.
    const updatedResignedIds = [...resignedIds, resigningPlayer.id];
    setResignedIds(updatedResignedIds);
    const resignedNames = game.players.filter((p) => updatedResignedIds.includes(p.id)).map((p) => p.name);
    endGameIfOver(removePlayers(game, [resigningPlayer.id]), resignedNames);
  }

  // Hotseat has no per-device turn gating (whoever's holding the device acts for the current
  // player), so isMyTurn is always true here — matches DiceTray's own default for this mode.
  const voice = useVoiceCommands({
    enabled: voiceOn,
    game,
    viewerSeat: game ? game.players[game.currentTurnIndex].id : 'P1',
    isMyTurn: true,
    resignAllowed,
    onRoll: handleRoll,
    onSelectValue: handleSelectValue,
    onSelectPiece: handleSelectPiece,
    onFormGatti: handleFormGatti,
    onResign: handleResign,
  });

  function handleRematch() {
    if (!game) return;
    setShowResults(false);
    setResignedIds([]);
    prevRevertSeq.current = 0;
    prevRankingIds.current = [];
    const next = rematch(game);
    setBanner(t('banner.turnStart', next.players[next.currentTurnIndex].name));
    setGame(next);
  }
  // Returns all the way to mode-select (not just this mode's own setup screen) so the player can
  // pick from every option — switch player count/roster here, or a different mode entirely —
  // rather than only being able to restart within whichever mode they happened to finish in.
  function handleNewSession() {
    navigate('/');
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
          resignAllowed={resignAllowed}
          onToggleResignAllowed={toggleResignAllowed}
        />
      )}

      {!inSetup && editorState && !game && (
        <div className="container">
          <div className="board-container">
            <Board
              game={editorState}
              onSelectPiece={() => {}}
              onSelectStats={() => {}}
              onPieceClickedBeforeValue={() => {}}
              editable
              onEditMove={handleEditMove}
            />
          </div>
          <div className="play-area">
            <h2>{t('editor.title')}</h2>
            <div className="editor-captured-list">
              {editorState.players.map((p) => (
                <label key={p.id} className="editor-captured-row">
                  <input type="checkbox" checked={p.hasCaptured} onChange={() => handleToggleCaptured(p.id)} />
                  {p.name} — {p.hasCaptured ? t('status.captureDone') : t('status.notCaptured')}
                </label>
              ))}
            </div>
            <div className="setup-row">
              <label className="setup-label" htmlFor="resumeAsSeat">
                {t('editor.resumeAs')}
              </label>
              <select id="resumeAsSeat" value={resumeAsSeat} onChange={(e) => setResumeAsSeat(e.target.value as PlayerId)}>
                {editorState.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sound-prompt">
              <div className="sound-prompt-question">{t('setup.resignAllowedQuestion')}</div>
              <button
                className={`btn-sound ${resignAllowed ? 'is-on' : 'is-off'}`}
                onClick={toggleResignAllowed}
                title={resignAllowed ? t('setup.resignDisableTitle') : t('setup.resignEnableTitle')}
              >
                {resignAllowed ? t('setup.resignOn') : t('setup.resignOff')}
              </button>
            </div>

            <div className="sound-prompt">
              <div className="sound-prompt-question">{t('setup.rollbackQuestion')}</div>
              <button
                className={`btn-sound ${rollbackEnabled ? 'is-on' : 'is-off'}`}
                onClick={toggleRollback}
                title={rollbackEnabled ? t('setup.rollbackDisableTitle') : t('setup.rollbackEnableTitle')}
              >
                {rollbackEnabled ? t('setup.rollbackOn') : t('setup.rollbackOff')}
              </button>
            </div>

            <div className="actions-row">
              <button className="action-btn btn-start" onClick={handleResumeFromEditor}>
                {t('editor.startFromHere')}
              </button>
              <button className="action-btn" onClick={handleResetPositions}>
                {t('editor.resetPositions')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!inSetup && game && (
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
              resignedIds={resignedIds}
            />
          </div>
          <div className="play-area">
            <div className={`announcer${hint ? ' announcer-hint' : ''}`}>{hint ? hint.text : banner}</div>
            <DiceTray
              game={game}
              onRoll={handleRoll}
              onSelectValue={handleSelectValue}
              showRollback={rollbackEnabled && game.phase !== 'game-over'}
              canRollback={!!game.lastMoveSnapshot}
              onRollback={handleRollback}
              resignAllowed={resignAllowed}
              onResign={handleResign}
            />
            {voice.supported && voiceOn && <PushToTalkButton voice={voice} />}
            <AppControlsPanel
              soundOn={soundOn}
              onToggleSound={toggleSound}
              onReportBug={() => setShowReportBug(true)}
              voiceCommandsAvailable={voice.supported}
              voiceOn={voiceOn}
              onToggleVoice={() => setVoiceOn((v) => !v)}
            />
          </div>
        </div>
      )}

      {resignedPlayerName && (
        <ResignModal playerName={resignedPlayerName} onDismiss={() => setResignedPlayerName(null)} />
      )}

      {showReportBug && game && (
        <ReportBugModal
          mode={allowCustomSetup ? 'develop-test' : 'hotseat'}
          gameId={null}
          debugLog={game.debugLog}
          onClose={() => setShowReportBug(false)}
        />
      )}

      {statsFor && <StatsModal name={statsFor} stats={stats[statsFor]} onClose={() => setStatsFor(null)} />}

      {!resignedPlayerName && showResults && game && (
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
