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
