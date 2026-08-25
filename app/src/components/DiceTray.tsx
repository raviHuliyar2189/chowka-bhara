import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameState } from '../game/turnEngine';
import { useT } from '../i18n/strings';
import kavadeBlack from '../assets/kavade-black.png';
import kavadeWhite from '../assets/kavade-white.png';

interface Props {
  game: GameState;
  onRoll: () => void;
  onSelectValue: (i: number) => void;
  showRollback: boolean;
  onRollback: () => void;
  // Online mode only: is it this device's own seat's turn? Defaults to true (hotseat mode,
  // where whoever's holding the device acting for the current player is always correct) —
  // when false, the roll button and pool values are disabled even though the phase would
  // otherwise allow them, so a player can't act out of turn on someone else's behalf.
  isMyTurn?: boolean;
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

export default function DiceTray({ game, onRoll, onSelectValue, showRollback, onRollback, isMyTurn = true }: Props) {
  const t = useT();
  const canRoll = game.phase === 'awaiting-roll' && isMyTurn;
  const current = game.players[game.currentTurnIndex];
  // Only 4 physical shells exist — the tray shows the latest throw, not one row per past roll
  // in this turn's bonus chain. Earlier rolls' values are still tracked in the pool below.
  const lastRollIndex = game.rollHistory.length - 1;
  const lastRoll = lastRollIndex >= 0 ? game.rollHistory[lastRollIndex] : null;

  return (
    <div className="dice-section">
      {/* 2. Roll button (the turn-indicator text box, item 1, is rendered by App.tsx just
         above this component), with the roll-back button alongside it when available */}
      <div className="roll-row">
        <button className="action-btn btn-roll" disabled={!canRoll} onClick={onRoll}>
          {t('dice.rollButton')}
        </button>
        {showRollback && (
          <button className="action-btn btn-rollback" onClick={onRollback} title={t('dice.rollbackTitle')}>
            {t('dice.rollbackButton')}
          </button>
        )}
      </div>

      {/* 3. Round throw area: shake (idle) or the latest throw's scattered result */}
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
      <div className="roll-label-row">
        {lastRoll ? (
          <>
            {lastRoll.label}
            {lastRoll.isBonus ? t('dice.bonus') : ''}
          </>
        ) : (
          t('dice.currentTurn', current.name)
        )}
      </div>

      {/* 5. Cumulative list of moves still to be played */}
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
    </div>
  );
}
