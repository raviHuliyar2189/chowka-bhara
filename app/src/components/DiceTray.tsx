import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameState } from '../game/turnEngine';
import { useT } from '../i18n/strings';
import kavadeBlack from '../assets/kavade-black.png';
import kavadeWhite from '../assets/kavade-white.png';

interface Props {
  game: GameState;
  onRoll: () => void;
  onSelectValue: (i: number) => void;
  // Whether roll-back is offered at all in this mode/game (a per-game setting) and whether it's
  // usable *right now* (was there actually a move to undo, is it my own — changes every move).
  // The button itself is always shown (see the game-controls-col JSX below) — both of these only
  // ever affect its `disabled` state, never whether it's mounted, so neither one changing can
  // itself cause layout jitter.
  showRollback: boolean;
  canRollback?: boolean;
  onRollback: () => void;
  // Online mode only: is it this device's own seat's turn? Defaults to true (hotseat mode,
  // where whoever's holding the device acting for the current player is always correct) —
  // when false, the roll button and pool values are disabled even though the phase would
  // otherwise allow them, so a player can't act out of turn on someone else's behalf.
  isMyTurn?: boolean;
  // "Game controls" (§11's layout pass): Roll the Dice / Roll Back Last Move / Moves still to play
  // / Resign Game / App Controls are one grouped, uniformly-sized, vertically-stacked component —
  // the game-mode page never renders any of these separately elsewhere. Resign is always shown,
  // just disabled wherever a mode/game doesn't offer it — see the game-controls-bottom-row JSX.
  resignAllowed?: boolean;
  onResign?: () => void;
  // Just the App Controls panel's inner content (AppControlsMenu.tsx's AppControlsPanel) — the
  // button and open/close state live here in DiceTray instead, since clicking it needs to overlay
  // the dice throw area (dice-circle-col) exactly, not pop over near the button itself; see
  // appControlsOpen below and .app-controls-overlay in App.css.
  appControls?: ReactNode;
}

const rand = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// Each die gets its own angular zone around the center of the round throw area (so a throw can
// never land two dice on top of each other), then jitters its angle/radius within that zone —
// seeded off the roll's own (random) face data, so the scatter varies with every real throw
// instead of a fixed pattern, while staying comfortably inside the circle rather than clipping
// its edge. A small per-die delay staggers the throw so all four don't land in perfect unison.
function scatterStyle(dieIndex: number, seed: number): CSSProperties {
  const baseAngles = [45, 135, 225, 315];
  const angle = ((baseAngles[dieIndex] + (rand(seed) - 0.5) * 55) * Math.PI) / 180;
  const radius = 15 + rand(seed + 1) * 16; // % of the circle's size, from its center
  const left = 50 + Math.cos(angle) * radius;
  const top = 50 + Math.sin(angle) * radius;
  const rotate = -32 + rand(seed + 2) * 64;
  const delay = rand(seed + 3) * 0.18;
  return {
    left: `${left}%`,
    top: `${top}%`,
    '--rot': `${rotate}deg`,
    animationDelay: `${delay}s`,
  } as CSSProperties;
}

// Just the 4 kavade themselves, loosely clustered and each flipping on its own asynchronous
// beat (a distinct animation period per die, not a simple stagger) — reads as a random tumble
// rather than a fixed pattern, shown while waiting for the current player to roll. No hand
// illustration; that read as clutter rather than adding anything. Each die is a real cropped
// photo of a kavade (cowrie shell), not a drawn shape — one crop for its "black" (mottled back)
// face, one for its "white" (toothed opening) face, cross-fading between the two via CSS.
function DiceIdleFigure() {
  const dice = [
    { x: 18, y: 18, rot: -12, duration: 0.9, delay: 0 },
    { x: 70, y: 8, rot: 7, duration: 1.3, delay: 0.15 },
    { x: 78, y: 62, rot: -9, duration: 1.05, delay: 0.35 },
    { x: 14, y: 70, rot: 13, duration: 1.5, delay: 0.5 },
  ];
  return (
    <div className="dice-idle-figure" aria-hidden="true">
      {dice.map((d, i) => (
        <div
          key={i}
          className="idle-die"
          style={{ left: `${d.x}px`, top: `${d.y}px`, transform: `rotate(${d.rot}deg)` }}
        >
          <img
            src={kavadeBlack}
            className="idle-die-face idle-die-face-black"
            style={{ animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }}
            alt=""
          />
          <img
            src={kavadeWhite}
            className="idle-die-face idle-die-face-white"
            style={{ animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }}
            alt=""
          />
        </div>
      ))}
    </div>
  );
}

export default function DiceTray({
  game,
  onRoll,
  onSelectValue,
  showRollback,
  canRollback = true,
  onRollback,
  isMyTurn = true,
  resignAllowed,
  onResign,
  appControls,
}: Props) {
  const t = useT();
  const canRoll = game.phase === 'awaiting-roll' && isMyTurn;
  const current = game.players[game.currentTurnIndex];
  // Only 4 physical shells exist — the tray shows the latest throw, not one row per past roll
  // in this turn's bonus chain. Earlier rolls' values are still tracked in the pool below.
  const lastRollIndex = game.rollHistory.length - 1;
  const lastRoll = lastRollIndex >= 0 ? game.rollHistory[lastRollIndex] : null;

  const [appControlsOpen, setAppControlsOpen] = useState(false);
  // The button and the overlay it opens live in two different branches of this same render (game-
  // controls-col vs dice-circle-col — see below), so a single wrapping ref can't catch outside
  // clicks the way a plain popover would; both are tracked here instead.
  const appControlsBtnRef = useRef<HTMLButtonElement>(null);
  const appControlsOverlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appControlsOpen) return;
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (appControlsBtnRef.current?.contains(target)) return;
      if (appControlsOverlayRef.current?.contains(target)) return;
      setAppControlsOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [appControlsOpen]);

  return (
    <div className="dice-section">
      {/* Round throw area: shake (idle) or the latest throw's scattered result — sits beside
         "Game controls" (roll/rollback, moves-still-to-play, resign) rather than above it, per
         the playing-screen layout pass (see REQUIREMENTS.md's Decisions log). */}
      <div className="dice-circle-col">
        <div className="dice-stage">
          <AnimatePresence>
            {game.rollHistory.length === 0 && (
              <motion.div
                key={`idle-${current.id}`}
                className="dice-idle"
                initial={false}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.4, ease: 'easeIn' }}
              >
                <DiceIdleFigure />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {lastRoll && (
              <motion.div
                key={lastRollIndex}
                className="dice-tray"
                initial={false}
                exit={{ opacity: 0, scale: 0.75 }}
                transition={{ duration: 0.5, ease: 'easeIn' }}
              >
                {lastRoll.faces.map((f, j) => (
                  <span
                    key={j}
                    className="die"
                    style={scatterStyle(j, lastRollIndex * 41 + j * 17 + f * 7)}
                  >
                    <img
                      src={f === 0 ? kavadeBlack : kavadeWhite}
                      className="die-face"
                      alt={f === 0 ? t('dice.faceBlack') : t('dice.faceWhite')}
                    />
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* "Game controls" (§11's layout pass): Roll the Dice, Roll Back Last Move, Moves still to
         play, Resign Game, and App Controls — one grouped, uniformly-sized, vertically-stacked
         component (each direct child the same width/height via .game-controls-col's own CSS, not
         per-button rules). */}
      <div className="game-controls-col">
        <button className="action-btn btn-roll" disabled={!canRoll} onClick={onRoll}>
          {t('dice.rollButton')}
        </button>
        <button
          className="action-btn btn-rollback"
          disabled={!showRollback || !canRollback}
          onClick={onRollback}
          title={t('dice.rollbackTitle')}
        >
          {t('dice.rollbackButton')}
        </button>

        {(() => {
          const needsChoice = game.phase === 'awaiting-selection' && game.pool.length > 1;
          return (
            <div className={needsChoice ? 'pool-section needs-choice' : 'pool-section'}>
              <strong>{t('dice.movesRemaining')}</strong>
              <div className="pool-container">
                {game.pool.length === 0 && <span>{t('dice.none')}</span>}
                {game.pool.map((val, i) => (
                  <button
                    key={i}
                    className={`val-btn${game.selectedPoolIndex === i ? ' selected' : ''}${needsChoice && game.selectedPoolIndex !== i ? ' needs-choice' : ''}`}
                    disabled={game.phase !== 'awaiting-selection' || !isMyTurn}
                    onClick={() => onSelectValue(i)}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Resign Game and App Control share one row (at the user's explicit request) rather than
           each being its own full-width row like the rest of Game Controls — both still the same
           height/style, just side by side. Resign is always shown, disabled when this game
           doesn't allow it, rather than being removed from the row — same reasoning as Roll Back
           above: a button that disappears/reappears as settings or turn state change is itself a
           layout jitter. */}
        <div className="game-controls-bottom-row">
          <button className="action-btn btn-abort" disabled={!resignAllowed} onClick={onResign}>
            {t('resign.gameButton')}
          </button>

          <button
            type="button"
            className="action-btn app-controls-btn"
            ref={appControlsBtnRef}
            onClick={() => setAppControlsOpen((v) => !v)}
            title={t('appControls.title')}
            aria-expanded={appControlsOpen}
          >
            {t('appControls.button')}
          </button>
        </div>
      </div>

      {/* App Controls opens covering this whole row (dice throw area + Game Controls), not just
         the throw area alone — on a narrow phone the throw area's own footprint (an ellipse
         narrower than the circle it replaces, see .dice-stage's phone-width override) isn't wide
         enough to hold the panel's rows without them feeling cramped, and Game Controls'
         own buttons aren't meant to stay usable while this is open anyway. inset: 0 against
         .dice-section itself (position: relative, see App.css) rather than .dice-circle-col
         specifically, so this automatically matches the full row's footprint on any screen size
         with no duplicated pixel dimensions to keep in sync. Content scrolls internally
         (.app-controls-overlay's own overflow-y) if it doesn't all fit at once. */}
      {appControlsOpen && (
        <div className="app-controls-overlay" ref={appControlsOverlayRef}>
          {appControls}
        </div>
      )}
    </div>
  );
}
