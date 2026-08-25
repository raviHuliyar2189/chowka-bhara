import type { CSSProperties, DragEvent } from 'react';
import { motion } from 'framer-motion';
import {
  PATHS,
  SAFE_CELLS,
  BASE_POSITIONS,
  FINISH_POS,
  INNER_RING_START,
  INNER_RING_END,
  isSameCell,
  isSafeCell,
  rotateCoord,
  pathPositionAt,
  type Coord,
  type PlayerId,
} from '../game/paths';
import type { GameState } from '../game/turnEngine';
import { canMovePiece, tolluAt, type Player } from '../game/rules';
import { computePlacements } from '../game/session';
import { useT, type T } from '../i18n/strings';

interface Props {
  game: GameState;
  onSelectPiece: (pieceId: number) => void;
  onSelectStats: (name: string) => void;
  onPieceClickedBeforeValue: () => void;
  // Gatti-tollu requirement: bonds an eligible tollu (2 of the current player's own pieces sharing
  // an inner-ring cell) into a permanent gatti. Omitted in contexts with no such action available
  // (the Board Editor's `editable` mode).
  onFormGatti?: (pos: number) => void;
  // Online mode only: this device's own seat. When set, pieces are only clickable/highlighted
  // as legal when it's actually THIS seat's turn — everyone still sees whose turn it is and
  // that player's active pieces, they just can't act on someone else's behalf. Omitted (the
  // default) in hotseat mode, where any device-holder acting for the current player is correct.
  viewerSeat?: PlayerId;
  // Develop Test mode only: replaces normal click/select/legal-highlight interaction with drag-
  // and-drop piece placement — every piece becomes draggable, every cell a drop target.
  editable?: boolean;
  onEditMove?: (playerId: PlayerId, pieceId: number, newPos: number) => void;
  // Hotseat/Develop Test only: ids of players removed via the Resign Game button (as opposed to
  // a no-capture-chance elimination or an online forfeit) — shown as a "(Resigned)" qualifier on
  // their status. Tracked client-side (not part of GameState) since resigning is unconditional
  // and purely a per-device UI action, not a game-core concept.
  resignedIds?: PlayerId[];
}

// A placement's exact ordinal (Winner/2nd place/3rd place) is only safe to show once it's stable
// — true immediately for a genuine finisher (nothing recorded later can ever outrank them, see
// insertIntoRankings in turnEngine.ts), but not for a forfeited/eliminated player until the game
// actually ends, since a later forfeit can still push them down a spot. Before that point such a
// player just shows the generic "Lost" — they know they're out, just not their final rank yet.
function statusFor(
  p: Player,
  game: GameState,
  placements: ReturnType<typeof computePlacements>,
  t: T
): string {
  if (p.hasDeclined) return t('status.declined');
  const placement = placements.find((pl) => pl.playerId === p.id);
  if (placement && (p.isFinished || game.phase === 'game-over')) {
    if (placement.isLoss) return t('status.lost');
    if (placement.place === 1) return t('status.winner');
    if (placement.place === 2) return t('status.second');
    return t('status.third');
  }
  if (p.hasLost) return t('status.lost');
  return t('status.playing');
}

// Canonical seating (P1 bottom, P2 right, P3 top, P4 left, matches SetupModal's seat labels) is
// the frame every game-logic coordinate lives in. For a given viewer, the board is rotated purely
// for DISPLAY so that viewer's own base always appears at the bottom — easier to read your own
// path when it starts right in front of you, whichever seat you're actually in. Hotseat has no
// single "viewer" (one shared screen), so it always renders the canonical, unrotated layout.
const PLAYER_ORDER: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
const SIDES_CYCLE = ['bottom', 'right', 'top', 'left'] as const;

function rotationStepsFor(viewerSeat: PlayerId | undefined): number {
  if (!viewerSeat) return 0;
  const viewerIndex = PLAYER_ORDER.indexOf(viewerSeat);
  return (4 - viewerIndex) % 4;
}

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

export default function Board({
  game,
  onSelectPiece,
  onSelectStats,
  onPieceClickedBeforeValue,
  onFormGatti,
  viewerSeat,
  editable,
  onEditMove,
  resignedIds,
}: Props) {
  const t = useT();
  const current = game.players[game.currentTurnIndex];
  const selectedVal = game.selectedPoolIndex !== null ? game.pool[game.selectedPoolIndex] : null;
  const colorOf = (id: PlayerId) => game.players.find((p) => p.id === id)?.color;
  const rotationSteps = rotationStepsFor(viewerSeat);
  const placements = computePlacements(game);

  function handleDragStart(e: DragEvent<HTMLDivElement>, playerId: PlayerId, pieceId: number) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ playerId, pieceId }));
  }

  // Mirrors canMovePiece's own friendly-blocking rule as a static placement check: no two of a
  // player's own pieces may share a non-safe outer-ring cell. Different players (or a player's
  // own pieces on safe/inner-ring cells) may freely share a cell during editing — no capture
  // simulation here, this is placement, not a move.
  function handleDrop(e: DragEvent<HTMLDivElement>, targetCoord: Coord) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const { playerId, pieceId } = JSON.parse(raw) as { playerId: PlayerId; pieceId: number };
    const newPos = pathPositionAt(playerId, targetCoord);
    if (newPos === null) return;
    const isInner = newPos >= INNER_RING_START && newPos <= INNER_RING_END;
    if (!isSafeCell(targetCoord) && !isInner) {
      const player = game.players.find((p) => p.id === playerId);
      const blocked = player?.pieces.some(
        (p) => p.id !== pieceId && isSameCell(PATHS[playerId][p.pos], targetCoord)
      );
      if (blocked) return;
    }
    onEditMove?.(playerId, pieceId, newPos);
  }

  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const coord: Coord = [r, c];
      const [displayR, displayC] = rotateCoord(coord, rotationSteps);
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

      // Gatti-tollu requirement: this cell holds an eligible tollu of the current player's own
      // pieces (2 of them, not yet bonded, inside the inner ring) that a selected pool value of 2
      // could bond into a gatti. Shown as its own affordance rather than folded into a piece
      // click, since forming a gatti moves both pieces together by a different (halved) distance
      // than clicking either one alone would — a genuinely separate choice, not just "select this
      // piece."
      const currentPos = !editable ? pathPositionAt(current.id, coord) : null;
      const canFormGattiHere =
        !editable &&
        !!onFormGatti &&
        game.phase !== 'game-over' &&
        game.phase === 'awaiting-selection' &&
        selectedVal === 2 &&
        (viewerSeat === undefined || viewerSeat === current.id) &&
        currentPos !== null &&
        tolluAt(current, currentPos) !== null;

      cells.push(
        <div
          key={`${r}-${c}`}
          className={`cell${isSafe ? ' marked' : ''}${editable ? ' editable' : ''}`}
          style={{ gridRow: displayR + 1, gridColumn: displayC + 1, ...(tint ? ({ '--tint': tint } as CSSProperties) : {}) }}
          onDragOver={editable ? (e) => e.preventDefault() : undefined}
          onDrop={editable ? (e) => handleDrop(e, coord) : undefined}
        >
          {canFormGattiHere && (
            <button
              type="button"
              className="gatti-form-btn"
              title={t('gatti.formTitle')}
              onClick={(e) => {
                e.stopPropagation();
                onFormGatti!(currentPos!);
              }}
            >
              {t('gatti.formButton')}
            </button>
          )}
          {piecesHere.map(({ player, piece }) => {
            if (editable) {
              return (
                <div
                  key={`${player.id}-${piece.id}`}
                  className="piece"
                  style={{ background: player.color }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, player.id, piece.id)}
                >
                  {piece.id}
                </div>
              );
            }
            const isCurrentPlayer = player.id === current.id && game.phase !== 'game-over';
            const isSelectable =
              isCurrentPlayer && game.phase === 'awaiting-selection' && (viewerSeat === undefined || viewerSeat === current.id);
            const isLegal =
              isSelectable && selectedVal !== null && canMovePiece(game.players, player, piece, selectedVal);
            const isIllegal = isSelectable && selectedVal !== null && !isLegal;
            // Pulse (the "active-turn" cue) only pieces that can actually be played: a finished
            // piece (reached the center) never has a legal move, and once a value is picked only
            // pieces legal for that specific value should keep pulsing — otherwise, any piece
            // legal for at least one pending pool value stays highlighted.
            const isFinished = piece.pos === FINISH_POS;
            const relevantVals = selectedVal !== null ? [selectedVal] : game.pool;
            const hasValidMove =
              relevantVals.length === 0 || relevantVals.some((v) => canMovePiece(game.players, player, piece, v));
            const isActive = isCurrentPlayer && !isFinished && hasValidMove;
            return (
              <motion.div
                key={`${player.id}-${piece.id}`}
                layoutId={`${player.id}-${piece.id}`}
                animate={isActive ? PULSE_ANIMATE : STILL_ANIMATE}
                transition={isActive ? PULSE_TRANSITION : STILL_TRANSITION}
                className={`piece${isActive ? ' active-turn' : ''}${isLegal ? ' legal' : ''}${isIllegal ? ' illegal' : ''}${piece.isGatti ? ' gatti' : ''}`}
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

  const labels = game.players.map((p) => {
    const status = statusFor(p, game, placements, t);
    const statusLabel = resignedIds?.includes(p.id) ? t('status.resignedSuffix', status) : status;
    const captureLabel = p.hasCaptured ? t('status.captureDone') : t('status.notCaptured');
    return (
      <button
        key={p.id}
        className={`home-label side-${SIDES_CYCLE[(PLAYER_ORDER.indexOf(p.id) + rotationSteps) % 4]}${
          p.hasDeclined ? ' declined' : p.hasLost ? ' lost' : ''
        }`}
        style={{ background: p.color }}
        onClick={() => onSelectStats(p.name)}
        title={t('board.statsTitle', p.name, statusLabel, captureLabel)}
      >
        {p.name}
        <span className="status-line">{statusLabel}</span>
        <span className="capture-status">{captureLabel}</span>
      </button>
    );
  });

  return (
    <div className="board">
      {cells}
      {labels}
    </div>
  );
}
