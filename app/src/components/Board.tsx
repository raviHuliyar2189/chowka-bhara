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
import { canMovePiece, tolluAt, type Player, type Piece } from '../game/rules';
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
  // Online mode only: which seats currently have a live socket connection (server-authoritative,
  // §13) — shown as a small dot on each player's home label. Omitted (the default) in every other
  // mode, where "connected" isn't a meaningful concept (everyone shares one device, or it's just
  // the local human + an always-present AI).
  connectedSeats?: PlayerId[];
  // Online mode only: which seats are currently in the voice channel (§13) — distinct from
  // connectedSeats, since a player can be connected to the game without having opted into voice.
  // This is roster membership only ("called voice:join"), not proof that audio is actually
  // flowing — see voiceConnectionStates below for that.
  voiceParticipants?: PlayerId[];
  // Online mode only: for every OTHER seat in the voice roster, this device's own real
  // RTCPeerConnection state to them (never present for viewerSeat itself — a client has no peer
  // connection to its own microphone). With no TURN server, two peers behind incompatible NATs can
  // sit in the roster forever while stuck at 'failed'/'disconnected' with no audio ever crossing —
  // the roster alone can't be told apart from a genuinely working connection, so the mic icon
  // reflects this instead of just membership (see the "voice chat not heard" bug this fixed).
  voiceConnectionStates?: Partial<Record<PlayerId, RTCPeerConnectionState>>;
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

// Gatti-tollu requirement: what one cell's worth of pieces actually renders as. A player's own
// pieces sharing a cell can be any mix of separate bonded gatti pairs (each rendered as one
// capsule), an incidental (not yet bonded) tollu pair, and lone singles — grouping this once per
// cell, rather than rendering every piece independently, is what makes a gatti move as one visual
// unit and a tollu read as a distinct pairing without actually merging its two still-independently
// movable pieces.
type RenderUnit =
  | { kind: 'single'; player: Player; piece: Piece }
  | { kind: 'tollu'; player: Player; a: Piece; b: Piece }
  | { kind: 'gatti'; player: Player; a: Piece; b: Piece };

function groupPieces(piecesHere: { player: Player; piece: Piece }[]): RenderUnit[] {
  const units: RenderUnit[] = [];
  const byPlayer = new Map<string, { player: Player; pieces: Piece[] }>();
  for (const { player, piece } of piecesHere) {
    const entry = byPlayer.get(player.id) ?? { player, pieces: [] };
    entry.pieces.push(piece);
    byPlayer.set(player.id, entry);
  }
  for (const { player, pieces } of byPlayer.values()) {
    const gattiPieces = pieces.filter((p) => p.isGatti);
    const seen = new Set<number>();
    for (const p of gattiPieces) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const partner = gattiPieces.find((q) => q.id === p.gattiPartnerId);
      if (partner) {
        seen.add(partner.id);
        units.push({ kind: 'gatti', player, a: p, b: partner });
      } else {
        // Bonded pieces always share a position, so this shouldn't normally happen — but render
        // it as a lone piece rather than crash if the partner is ever missing from this cell.
        units.push({ kind: 'single', player, piece: p });
      }
    }
    const singles = pieces.filter((p) => !p.isGatti);
    // Tollu is only a meaningful pairing inside the inner ring (matches tolluAt in rules.ts) —
    // everywhere else (home, center, the outer ring) sharing a cell is just ordinary stacking with
    // nothing gatti-related about it, so those always render as plain independent singles even
    // when 2+ of a player's own pieces happen to coincide (e.g. every piece starts stacked at home).
    const inInnerRing = (p: Piece) => p.pos >= INNER_RING_START && p.pos <= INNER_RING_END;
    if (singles.length >= 2 && singles.every(inInnerRing)) {
      units.push({ kind: 'tollu', player, a: singles[0], b: singles[1] });
      for (let i = 2; i < singles.length; i++) units.push({ kind: 'single', player, piece: singles[i] });
    } else {
      singles.forEach((piece) => units.push({ kind: 'single', player, piece }));
    }
  }
  return units;
}

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
  connectedSeats,
  voiceParticipants,
  voiceConnectionStates,
}: Props) {
  const t = useT();
  const current = game.players[game.currentTurnIndex];
  const selectedVal = game.selectedPoolIndex !== null ? game.pool[game.selectedPoolIndex] : null;
  const colorOf = (id: PlayerId) => game.players.find((p) => p.id === id)?.color;
  const rotationSteps = rotationStepsFor(viewerSeat);
  const placements = computePlacements(game);

  // Shared by every non-editable render unit below (a lone piece, either half of a tollu, or a
  // gatti capsule as a whole) — the same selectability/legality/active-pulse logic that used to
  // live inline in one flat piece loop, now reusable since a gatti capsule computes it once for
  // the pair rather than per individual piece.
  function pieceState(player: Player, piece: Piece) {
    const isCurrentPlayer = player.id === current.id && game.phase !== 'game-over';
    const isSelectable =
      isCurrentPlayer && game.phase === 'awaiting-selection' && (viewerSeat === undefined || viewerSeat === current.id);
    const isLegal = isSelectable && selectedVal !== null && canMovePiece(game.players, player, piece, selectedVal);
    const isIllegal = isSelectable && selectedVal !== null && !isLegal;
    const isFinished = piece.pos === FINISH_POS;
    // Only let the dice pool narrow the glow while a value is actually pickable right now
    // (awaiting-selection). During awaiting-roll — including the mandatory bonus roll right after
    // a capture, which leaves a leftover pool value sitting unusable until that roll happens — no
    // piece is clickable yet, so every one of the current player's live pieces glows uniformly
    // (matching plain turn-start, where the pool is empty) rather than singling out whichever piece
    // could use that not-yet-playable leftover value, which reads exactly like a legal move and
    // isn't (see Board.tsx bug: piece glowing as if landing on an opponent's gatti were clickable).
    const relevantVals =
      game.phase === 'awaiting-selection' ? (selectedVal !== null ? [selectedVal] : game.pool) : [];
    const hasValidMove =
      relevantVals.length === 0 || relevantVals.some((v) => canMovePiece(game.players, player, piece, v));
    const isActive = isCurrentPlayer && !isFinished && hasValidMove;
    return { isSelectable, isLegal, isIllegal, isActive };
  }

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
          {editable
            ? piecesHere.map(({ player, piece }) => (
                <div
                  key={`${player.id}-${piece.id}`}
                  className="piece"
                  style={{ background: player.color }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, player.id, piece.id)}
                >
                  {piece.id}
                </div>
              ))
            : groupPieces(piecesHere).map((unit) => {
                if (unit.kind === 'single') {
                  const { player, piece } = unit;
                  const st = pieceState(player, piece);
                  return (
                    <motion.div
                      key={`${player.id}-${piece.id}`}
                      layoutId={`${player.id}-${piece.id}`}
                      animate={st.isActive ? PULSE_ANIMATE : STILL_ANIMATE}
                      transition={st.isActive ? PULSE_TRANSITION : STILL_TRANSITION}
                      className={`piece${st.isActive ? ' active-turn' : ''}${st.isLegal ? ' legal' : ''}${st.isIllegal ? ' illegal' : ''}`}
                      style={{ background: player.color }}
                      whileHover={st.isLegal ? HOVER_LEGAL : undefined}
                      whileTap={st.isLegal ? TAP_LEGAL : undefined}
                      onClick={() => {
                        if (st.isLegal) onSelectPiece(piece.id);
                        else if (st.isSelectable && selectedVal === null) onPieceClickedBeforeValue();
                      }}
                    >
                      {piece.id}
                    </motion.div>
                  );
                }

                if (unit.kind === 'tollu') {
                  const { player, a, b } = unit;
                  return (
                    // Purely a visual grouping — each piece underneath keeps its own independent
                    // click/legal/motion identity, since a tollu's two pieces can still be moved
                    // individually (the player's other choice besides forming a gatti — see
                    // canFormGattiHere's own comment).
                    <div key={`${player.id}-tollu-${a.id}-${b.id}`} className="tollu-group">
                      {[a, b].map((piece) => {
                        const st = pieceState(player, piece);
                        return (
                          <motion.div
                            key={`${player.id}-${piece.id}`}
                            layoutId={`${player.id}-${piece.id}`}
                            animate={st.isActive ? PULSE_ANIMATE : STILL_ANIMATE}
                            transition={st.isActive ? PULSE_TRANSITION : STILL_TRANSITION}
                            className={`piece${st.isActive ? ' active-turn' : ''}${st.isLegal ? ' legal' : ''}${st.isIllegal ? ' illegal' : ''}`}
                            style={{ background: player.color }}
                            whileHover={st.isLegal ? HOVER_LEGAL : undefined}
                            whileTap={st.isLegal ? TAP_LEGAL : undefined}
                            onClick={() => {
                              if (st.isLegal) onSelectPiece(piece.id);
                              else if (st.isSelectable && selectedVal === null) onPieceClickedBeforeValue();
                            }}
                          >
                            {piece.id}
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                }

                // 'gatti' — a single capsule for the bonded pair, one motion element/layoutId so
                // it visibly moves as one unit rather than two pieces that just happen to always
                // land in the same place. Legality/activity is computed once off either piece
                // (symmetric for a bonded pair — they always share a position and move together).
                const { player, a, b } = unit;
                const st = pieceState(player, a);
                const capsuleKey = `${player.id}-gatti-${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
                return (
                  <motion.div
                    key={capsuleKey}
                    layoutId={capsuleKey}
                    animate={st.isActive ? PULSE_ANIMATE : STILL_ANIMATE}
                    transition={st.isActive ? PULSE_TRANSITION : STILL_TRANSITION}
                    className={`gatti-capsule${st.isActive ? ' active-turn' : ''}${st.isLegal ? ' legal' : ''}${st.isIllegal ? ' illegal' : ''}`}
                    whileHover={st.isLegal ? HOVER_LEGAL : undefined}
                    whileTap={st.isLegal ? TAP_LEGAL : undefined}
                    onClick={() => {
                      if (st.isLegal) onSelectPiece(a.id);
                      else if (st.isSelectable && selectedVal === null) onPieceClickedBeforeValue();
                    }}
                  >
                    <span className="gatti-pip" style={{ background: player.color }}>
                      {a.id}
                    </span>
                    <span className="gatti-pip" style={{ background: player.color }}>
                      {b.id}
                    </span>
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
    // Online mode only (§13) — connectedSeats is only ever passed there. isOnline is meaningless
    // (and not shown) everywhere else, where "connected" isn't a real concept.
    const isOnline = connectedSeats?.includes(p.id);
    const inVoice = voiceParticipants?.includes(p.id);
    // Roster membership alone ("called voice:join") doesn't mean audio is actually flowing — with
    // no TURN server, a peer stuck behind an incompatible NAT can sit in the roster forever while
    // never connecting. viewerSeat itself has no peer connection to its own microphone, so it's
    // always shown as connected once in the roster; every other seat reflects this device's own
    // real RTCPeerConnection state to them, which can differ from what another device sees for
    // that same peer (each mesh link is its own independent connection).
    const voiceState: 'connected' | 'connecting' | 'failed' | null = !inVoice
      ? null
      : p.id === viewerSeat
        ? 'connected'
        : (() => {
            const s = voiceConnectionStates?.[p.id];
            if (s === 'connected') return 'connected';
            if (s === 'failed' || s === 'disconnected' || s === 'closed') return 'failed';
            return 'connecting';
          })();
    const presenceTitle = connectedSeats ? t(isOnline ? 'presence.online' : 'presence.offline') : null;
    const voiceTitle =
      voiceState === 'connected'
        ? t('voice.inVoice')
        : voiceState === 'connecting'
          ? t('voice.connecting')
          : voiceState === 'failed'
            ? t('voice.connectFailed')
            : null;
    const title = [t('board.statsTitle', p.name, statusLabel, captureLabel), presenceTitle, voiceTitle]
      .filter(Boolean)
      .join(' — ');
    return (
      <button
        key={p.id}
        className={`home-label side-${SIDES_CYCLE[(PLAYER_ORDER.indexOf(p.id) + rotationSteps) % 4]}${
          p.hasDeclined ? ' declined' : p.hasLost ? ' lost' : ''
        }`}
        style={{ background: p.color }}
        onClick={() => onSelectStats(p.name)}
        title={title}
      >
        {connectedSeats && (
          <span className={`presence-dot ${isOnline ? 'online' : 'offline'}`} aria-hidden="true" />
        )}
        {voiceState && (
          <span className={`voice-indicator voice-${voiceState}`} aria-hidden="true">
            {voiceState === 'failed' ? '⚠️' : '🎙️'}
          </span>
        )}
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
