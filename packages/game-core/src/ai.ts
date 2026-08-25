import type { GameState } from './turnEngine';
import { type Player, type Piece, canMovePiece, resolveCaptures, canFormGatti, gattiStepFor } from './rules';
import { type PlayerId, type Coord, coordAt, isSafeCell, isSameCell, INNER_RING_START, FINISH_POS } from './paths';

// Plausible roll values a die throw can produce (see dice.ts) — used to predict whether an
// opponent could reach a given cell on their next turn, not to simulate an actual roll.
const POSSIBLE_ROLLS = [1, 2, 3, 4, 8];

// Would an opponent be able to land on this coordinate next turn? Skips safe cells outright (never
// capturable); otherwise checks every active opponent's every piece against every plausible roll,
// respecting the same inner-ring capture-gate rule canMovePiece itself enforces. A gatti piece
// only ever advances at its own halved rate (gattiStepFor), never the raw roll value.
function isVulnerable(players: Player[], aiId: PlayerId, targetCoord: Coord): boolean {
  if (isSafeCell(targetCoord)) return false;
  for (const opp of players) {
    if (opp.id === aiId || opp.hasLost || opp.isFinished) continue;
    for (const piece of opp.pieces) {
      if (piece.pos === FINISH_POS) continue;
      for (const val of POSSIBLE_ROLLS) {
        const step = piece.isGatti ? gattiStepFor(val) : val;
        if (step === null) continue;
        const oppTarget = piece.pos + step;
        if (oppTarget > FINISH_POS) continue;
        if (!piece.isGatti && oppTarget >= INNER_RING_START && !opp.hasCaptured) continue;
        if (isSameCell(coordAt(opp.id, oppTarget), targetCoord)) return true;
      }
    }
  }
  return false;
}

function targetPosFor(piece: Piece, val: number): number {
  return piece.isGatti ? piece.pos + gattiStepFor(val)! : piece.pos + val;
}

function scoreMove(state: GameState, aiPlayer: Player, pieceId: number, val: number): number {
  const piece = aiPlayer.pieces.find((p) => p.id === pieceId)!;
  const targetPos = targetPosFor(piece, val);
  const targetCoord = coordAt(aiPlayer.id, targetPos);
  const captures = resolveCaptures(state.players, aiPlayer, targetCoord, piece.isGatti);

  let score = captures.length * 100;
  if (targetPos === FINISH_POS) score += 50;
  if (isVulnerable(state.players, aiPlayer.id, targetCoord)) score -= 30;
  score += targetPos; // mild forward-progress tiebreaker
  return score;
}

// Bonding a tollu into a gatti is evaluated the same way as any other move (captures, reaching the
// center, forward progress) plus a modest flat bonus for the safety a bonded pair gains (only a
// gatti can ever capture it back) — enough to make the AI actually take the opportunity when it's
// otherwise a close call, without making it obsess over bonding when a stronger move exists.
function scoreFormGatti(state: GameState, aiPlayer: Player, pos: number): number {
  const targetPos = pos + 1;
  const targetCoord = coordAt(aiPlayer.id, targetPos);
  const captures = resolveCaptures(state.players, aiPlayer, targetCoord, true);

  let score = captures.length * 100;
  if (targetPos === FINISH_POS) score += 50;
  score += targetPos;
  score += 15;
  return score;
}

export type AiDecision =
  | { kind: 'move'; poolIndex: number; pieceId: number }
  | { kind: 'form-gatti'; poolIndex: number; pos: number };

// Picks which pool value and which action (move a piece, or bond a tollu into a gatti) the
// computer opponent should take, given the current awaiting-selection state — reused by the caller
// for both the value-selection and piece-selection steps (see VsComputerPage.tsx, which chains
// selectPoolValue with this single decision rather than the two-click flow a human uses). Returns
// null if there's genuinely no legal action (shouldn't normally happen — the turn engine reverts a
// stuck pool before this would be called with an unplayable one — but kept honest rather than
// assuming).
export function chooseAiMove(state: GameState, aiId: PlayerId): AiDecision | null {
  const aiPlayer = state.players.find((p) => p.id === aiId);
  if (!aiPlayer) return null;

  let best: (AiDecision & { score: number }) | null = null;
  for (let poolIndex = 0; poolIndex < state.pool.length; poolIndex++) {
    const val = state.pool[poolIndex];
    for (const piece of aiPlayer.pieces) {
      if (!canMovePiece(state.players, aiPlayer, piece, val)) continue;
      const score = scoreMove(state, aiPlayer, piece.id, val);
      if (!best || score > best.score) best = { kind: 'move', poolIndex, pieceId: piece.id, score };
    }
    const tolluPositions = new Set(aiPlayer.pieces.filter((p) => !p.isGatti).map((p) => p.pos));
    for (const pos of tolluPositions) {
      if (!canFormGatti(aiPlayer, pos, val)) continue;
      const score = scoreFormGatti(state, aiPlayer, pos);
      if (!best || score > best.score) best = { kind: 'form-gatti', poolIndex, pos, score };
    }
  }
  if (!best) return null;
  return best.kind === 'move'
    ? { kind: 'move', poolIndex: best.poolIndex, pieceId: best.pieceId }
    : { kind: 'form-gatti', poolIndex: best.poolIndex, pos: best.pos };
}
