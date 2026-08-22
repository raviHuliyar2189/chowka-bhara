import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { PATHS, SAFE_CELLS, BASE_POSITIONS, FINISH_POS, isSameCell, type Coord, type PlayerId } from '../game/paths';
import type { GameState } from '../game/turnEngine';
import { canMovePiece } from '../game/rules';

interface Props {
  game: GameState;
  onSelectPiece: (pieceId: number) => void;
  onSelectStats: (name: string) => void;
  onPieceClickedBeforeValue: () => void;
  // Online mode only: this device's own seat. When set, pieces are only clickable/highlighted
  // as legal when it's actually THIS seat's turn — everyone still sees whose turn it is and
  // that player's active pieces, they just can't act on someone else's behalf. Omitted (the
  // default) in hotseat mode, where any device-holder acting for the current player is correct.
  viewerSeat?: PlayerId;
}

// Fixed seating: P1 bottom, P2 right, P3 top, P4 left (matches SetupModal's seat labels).
const HOME_SIDE: Record<PlayerId, 'top' | 'bottom' | 'left' | 'right'> = {
  P1: 'bottom',
  P2: 'right',
  P3: 'top',
  P4: 'left',
};

// Hoisted to stable references, not recreated per render: framer-motion treats a fresh object/
// array literal passed to animate/transition as a new instruction, which can restart a piece's
// in-progress animation (the active-turn pulse) even when nothing about that piece actually
// changed — e.g. every OTHER piece's animation was visibly restarting whenever any one piece
// moved, since Board re-renders (and thus recreates inline literals) on every game state change.
const PULSE_ANIMATE = { scale: [1, 1.22, 1] };
const STILL_ANIMATE = { scale: 1 };
const LAYOUT_SPRING = { type: 'spring', stiffness: 500, damping: 32 } as const;
const PULSE_TRANSITION = {
  layout: LAYOUT_SPRING,
  scale: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
} as const;
const STILL_TRANSITION = { layout: LAYOUT_SPRING, scale: LAYOUT_SPRING } as const;
const HOVER_LEGAL = { scale: 1.35 };
const TAP_LEGAL = { scale: 0.9 };

export default function Board({ game, onSelectPiece, onSelectStats, onPieceClickedBeforeValue, viewerSeat }: Props) {
  const current = game.players[game.currentTurnIndex];
  const selectedVal = game.selectedPoolIndex !== null ? game.pool[game.selectedPoolIndex] : null;
  const colorOf = (id: PlayerId) => game.players.find((p) => p.id === id)?.color;

  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const coord: Coord = [r, c];
      const isSafe = SAFE_CELLS.some((s) => isSameCell(s, coord));
      const homeOwner = (Object.keys(BASE_POSITIONS) as PlayerId[]).find((id) =>
        isSameCell(BASE_POSITIONS[id], coord)
      );
      const tint = homeOwner ? colorOf(homeOwner) : undefined;

      const piecesHere = game.players
        .filter((p) => !p.hasLost)
        .flatMap((p) =>
          p.pieces
            .filter((piece) => isSameCell(PATHS[p.id][piece.pos], coord))
            .map((piece) => ({ player: p, piece }))
        );

      cells.push(
        <div
          key={`${r}-${c}`}
          className={`cell${isSafe ? ' marked' : ''}`}
          style={tint ? ({ '--tint': tint } as CSSProperties) : undefined}
        >
          {piecesHere.map(({ player, piece }) => {
            const isCurrentPlayer = player.id === current.id && game.phase !== 'game-over';
            const isSelectable =
              isCurrentPlayer && game.phase === 'awaiting-selection' && (viewerSeat === undefined || viewerSeat === current.id);
            const isLegal = isSelectable && selectedVal !== null && canMovePiece(player, piece, selectedVal);
            const isIllegal = isSelectable && selectedVal !== null && !isLegal;
            // Pulse (the "active-turn" cue) only pieces that can actually be played: a finished
            // piece (reached the center) never has a legal move, and once a value is picked only
            // pieces legal for that specific value should keep pulsing — otherwise, any piece
            // legal for at least one pending pool value stays highlighted.
            const isFinished = piece.pos === FINISH_POS;
            const relevantVals = selectedVal !== null ? [selectedVal] : game.pool;
            const hasValidMove =
              relevantVals.length === 0 || relevantVals.some((v) => canMovePiece(player, piece, v));
            const isActive = isCurrentPlayer && !isFinished && hasValidMove;
            return (
              <motion.div
                key={`${player.id}-${piece.id}`}
                layoutId={`${player.id}-${piece.id}`}
                animate={isActive ? PULSE_ANIMATE : STILL_ANIMATE}
                transition={isActive ? PULSE_TRANSITION : STILL_TRANSITION}
                className={`piece${isActive ? ' active-turn' : ''}${isLegal ? ' legal' : ''}${isIllegal ? ' illegal' : ''}`}
                style={{ background: player.color }}
                whileHover={isLegal ? HOVER_LEGAL : undefined}
                whileTap={isLegal ? TAP_LEGAL : undefined}
                onClick={() => {
                  if (isLegal) {
                    onSelectPiece(piece.id);
                  } else if (isSelectable && selectedVal === null) {
                    onPieceClickedBeforeValue();
                  }
                }}
              >
                {piece.id}
              </motion.div>
            );
          })}
        </div>
      );
    }
  }

  const labels = game.players.map((p) => (
    <button
      key={p.id}
      className={`home-label side-${HOME_SIDE[p.id]}${p.hasLost ? ' lost' : ''}`}
      style={{ background: p.color }}
      onClick={() => onSelectStats(p.name)}
      title={`${p.name}'s statistics${p.isFinished ? ' (finished)' : p.hasLost ? ' (left)' : ''}`}
    >
      {p.name}
      {p.isFinished ? ' ✓' : ''}
    </button>
  ));

  return (
    <div className="board">
      {cells}
      {labels}
    </div>
  );
}
