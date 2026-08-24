import {
  type PlayerId,
  type Coord,
  coordAt,
  isSameCell,
  isSafeCell,
  INNER_RING_START,
  INNER_RING_END,
  FINISH_POS,
} from './paths';

export interface Piece {
  id: number;
  pos: number; // 0 (home) .. 24 (center)
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  pieces: Piece[];
  isFinished: boolean;
  hasLost: boolean;
  hasCaptured: boolean; // must capture at least one opponent piece before entering the inner ring
}

// Safe cells (all 4 bases + center) allow unlimited stacking of anyone's pieces and are never
// capturable. Outside those, the inner ring (positions 16-23) allows a player's own pieces to
// stack; the outer ring (1-15) does not.
export function canMovePiece(player: Player, piece: Piece, val: number): boolean {
  const newPos = piece.pos + val;
  if (newPos > FINISH_POS) return false;

  // A piece may not enter the inner ring (or the center, which is only reachable through it)
  // until this player has captured at least one opponent piece.
  if (newPos >= INNER_RING_START && !player.hasCaptured) return false;

  const targetCoord = coordAt(player.id, newPos);
  if (isSafeCell(targetCoord)) return true;

  const isInnerRing = newPos >= INNER_RING_START && newPos <= INNER_RING_END;
  if (!isInnerRing) {
    const friendlyBlocking = player.pieces.some(
      (p) => p !== piece && isSameCell(coordAt(player.id, p.pos), targetCoord)
    );
    if (friendlyBlocking) return false;
  }
  return true;
}

export function hasAnyLegalMove(player: Player, pool: number[]): boolean {
  return pool.some((val) => player.pieces.some((p) => canMovePiece(player, p, val)));
}

function coordKey(c: Coord): string {
  return `${c[0]},${c[1]}`;
}

// Every non-safe coordinate any of this player's own pieces could still reach by moving forward
// along their own path, from wherever each piece currently sits.
function remainingReach(player: Player): Set<string> {
  const coords = new Set<string>();
  for (const piece of player.pieces) {
    for (let pos = piece.pos + 1; pos <= FINISH_POS; pos++) {
      const c = coordAt(player.id, pos);
      if (!isSafeCell(c)) coords.add(coordKey(c));
    }
  }
  return coords;
}

// A player who hasn't captured anyone yet is permanently barred from the inner ring (see
// canMovePiece above), so they can never finish without one. This checks whether that's still
// mathematically possible: is there any active opponent piece — now or wherever it still has left
// to travel on its own path — sitting on a coordinate this player's pieces could ever reach?
// Movement is one-directional (positions only increase), so once that's false for every opponent
// it stays false — this player has no path left to a win.
export function hasCaptureChance(player: Player, allPlayers: Player[]): boolean {
  if (player.hasCaptured) return true;
  const myReach = remainingReach(player);
  if (myReach.size === 0) return false;

  for (const opp of allPlayers) {
    if (opp.id === player.id || opp.hasLost) continue;
    for (const piece of opp.pieces) {
      if (piece.pos === FINISH_POS) continue; // permanently parked at center, never capturable again
      for (let pos = piece.pos; pos <= FINISH_POS; pos++) {
        const c = coordAt(opp.id, pos);
        if (!isSafeCell(c) && myReach.has(coordKey(c))) return true;
      }
    }
  }
  return false;
}

export interface CaptureResult {
  player: Player;
  piece: Piece;
}

export function resolveCaptures(players: Player[], movingPlayer: Player, targetCoord: Coord): CaptureResult[] {
  if (isSafeCell(targetCoord)) return [];
  const captured: CaptureResult[] = [];
  for (const opp of players) {
    if (opp.id === movingPlayer.id || opp.hasLost) continue;
    for (const oppPiece of opp.pieces) {
      if (isSameCell(coordAt(opp.id, oppPiece.pos), targetCoord)) {
        captured.push({ player: opp, piece: oppPiece });
      }
    }
  }
  return captured;
}

export function movePiece(players: Player[], player: Player, piece: Piece, val: number): CaptureResult[] {
  piece.pos += val;
  const targetCoord = coordAt(player.id, piece.pos);
  const captured = resolveCaptures(players, player, targetCoord);
  captured.forEach(({ piece: p }) => {
    p.pos = 0;
  });
  if (captured.length > 0) {
    player.hasCaptured = true;
  }
  if (player.pieces.every((p) => p.pos === FINISH_POS)) {
    player.isFinished = true;
  }
  return captured;
}
