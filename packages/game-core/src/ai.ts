import type { GameState } from './turnEngine';
import { type Player, canMovePiece, resolveCaptures } from './rules';
import { type PlayerId, type Coord, coordAt, isSafeCell, isSameCell, INNER_RING_START, FINISH_POS } from './paths';

// Plausible roll values a die throw can produce (see dice.ts) — used to predict whether an
// opponent could reach a given cell on their next turn, not to simulate an actual roll.
const POSSIBLE_ROLLS = [1, 2, 3, 4, 8];

// Would an opponent be able to land on this coordinate next turn? Skips safe cells outright (never
// capturable); otherwise checks every active opponent's every piece against every plausible roll,
// respecting the same inner-ring capture-gate rule canMovePiece itself enforces.
function isVulnerable(players: Player[], aiId: PlayerId, targetCoord: Coord): boolean {
  if (isSafeCell(targetCoord)) return false;
  for (const opp of players) {
    if (opp.id === aiId || opp.hasLost || opp.isFinished) continue;
    for (const piece of opp.pieces) {
      if (piece.pos === FINISH_POS) continue;
      for (const val of POSSIBLE_ROLLS) {
        const oppTarget = piece.pos + val;
        if (oppTarget > FINISH_POS) continue;
        if (oppTarget >= INNER_RING_START && !opp.hasCaptured) continue;
        if (isSameCell(coordAt(opp.id, oppTarget), targetCoord)) return true;
      }
    }
  }
  return false;
}

function scoreMove(state: GameState, aiPlayer: Player, pieceId: number, val: number): number {
  const piece = aiPlayer.pieces.find((p) => p.id === pieceId)!;
  const targetPos = piece.pos + val;
  const targetCoord = coordAt(aiPlayer.id, targetPos);
  const captures = resolveCaptures(state.players, aiPlayer, targetCoord);

  let score = captures.length * 100;
  if (targetPos === FINISH_POS) score += 50;
  if (isVulnerable(state.players, aiPlayer.id, targetCoord)) score -= 30;
  score += targetPos; // mild forward-progress tiebreaker
  return score;
}

// Picks which pool value and which piece the computer opponent should play, given the current
// awaiting-selection state — reused by the caller for both the value-selection and piece-selection
// steps (see VsComputerPage.tsx, which chains selectPoolValue + selectPiece with this single
// decision rather than the two-click flow a human uses). Returns null if there's genuinely no
// legal move (shouldn't normally happen — the turn engine reverts a stuck pool before this would
// be called with an unplayable one — but kept honest rather than assuming).
export function chooseAiMove(state: GameState, aiId: PlayerId): { poolIndex: number; pieceId: number } | null {
  const aiPlayer = state.players.find((p) => p.id === aiId);
  if (!aiPlayer) return null;

  let best: { poolIndex: number; pieceId: number; score: number } | null = null;
  for (let poolIndex = 0; poolIndex < state.pool.length; poolIndex++) {
    const val = state.pool[poolIndex];
    for (const piece of aiPlayer.pieces) {
      if (!canMovePiece(aiPlayer, piece, val)) continue;
      const score = scoreMove(state, aiPlayer, piece.id, val);
      if (!best || score > best.score) best = { poolIndex, pieceId: piece.id, score };
    }
  }
  return best ? { poolIndex: best.poolIndex, pieceId: best.pieceId } : null;
}
