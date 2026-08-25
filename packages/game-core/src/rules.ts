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
  // Permanently bonded with another of this player's pieces sharing the same inner-ring cell (see
  // formGatti below) — once true, this piece never moves alone again: it and its sibling always
  // move together at the halved gatti rate, until either both are captured (sent home, unbonded)
  // or both reach the center. Only ever set inside the inner ring (16-23) — see tolluAt.
  isGatti: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  pieces: Piece[];
  isFinished: boolean;
  hasLost: boolean;
  hasCaptured: boolean; // must capture at least one opponent piece before entering the inner ring
  // Online mode only: declined the invite rather than joining. Always paired with hasLost: true
  // (so every existing hasLost-based exclusion — advanceTurn's active filter, resolveCaptures'
  // "skip hasLost" check — excludes them from real gameplay for free) — this field only exists
  // to tell "declined" apart from an in-game forfeit for display/stats purposes.
  hasDeclined: boolean;
}

// Gatti-tollu requirement: once bonded, a gatti moves at half the normal rate — a die value only
// moves it if it's one of these three, by the paired (halved) square count, never the raw value.
const GATTI_STEPS: Record<number, number> = { 2: 1, 4: 2, 8: 4 };

export function gattiStepFor(val: number): number | null {
  return GATTI_STEPS[val] ?? null;
}

// Two of a player's own (not yet bonded) pieces sharing one inner-ring cell — a "tollu". Only
// meaningful inside the inner ring (16-23): outer-ring cells never allow a player's own pieces to
// share a cell in the first place (see the friendly-blocking check below), and home/center are
// unlimited-stacking safe cells for everyone where the concept doesn't apply. Returns null rather
// than a lone piece or a 3+ pile — the gatti-tollu rules only ever speak of pairs.
export function tolluAt(player: Player, pos: number): [Piece, Piece] | null {
  if (pos < INNER_RING_START || pos > INNER_RING_END) return null;
  const here = player.pieces.filter((p) => p.pos === pos && !p.isGatti);
  return here.length === 2 ? [here[0], here[1]] : null;
}

// A tollu becomes a gatti only via an exact roll of 2, moving both pieces together by 1 square
// (the same halved rate a gatti keeps from then on) — the sole way a gatti is ever formed.
export function canFormGatti(player: Player, pos: number, val: number): boolean {
  return val === 2 && tolluAt(player, pos) !== null && pos + 1 <= FINISH_POS;
}

// A single (non-gatti) piece can never jump over a cell holding an opponent's gatti — it must
// first land exactly on that cell (landing there is fine: no capture, they simply coexist — see
// resolveCaptures) and can only continue past it on some later turn. Only inner-ring cells can
// ever hold a gatti, so only that stretch of the path needs checking regardless of where the move
// started or ends.
function opponentGattiBlocksCrossing(allPlayers: Player[], mover: Player, fromPos: number, toPos: number): boolean {
  for (let pos = fromPos + 1; pos < toPos; pos++) {
    if (pos < INNER_RING_START || pos > INNER_RING_END) continue;
    const coord = coordAt(mover.id, pos);
    for (const opp of allPlayers) {
      if (opp.id === mover.id || opp.hasLost) continue;
      if (opp.pieces.some((p) => p.isGatti && isSameCell(coordAt(opp.id, p.pos), coord))) return true;
    }
  }
  return false;
}

// Safe cells (all 4 bases + center) allow unlimited stacking of anyone's pieces and are never
// capturable. Outside those, the inner ring (positions 16-23) allows a player's own pieces to
// stack; the outer ring (1-15) does not.
export function canMovePiece(allPlayers: Player[], player: Player, piece: Piece, val: number): boolean {
  if (piece.isGatti) {
    const step = gattiStepFor(val);
    if (step === null) return false;
    return piece.pos + step <= FINISH_POS;
  }

  const newPos = piece.pos + val;
  if (newPos > FINISH_POS) return false;

  // A piece may not enter the inner ring (or the center, which is only reachable through it)
  // until this player has captured at least one opponent piece.
  if (newPos >= INNER_RING_START && !player.hasCaptured) return false;

  if (opponentGattiBlocksCrossing(allPlayers, player, piece.pos, newPos)) return false;

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

export function hasAnyLegalMove(allPlayers: Player[], player: Player, pool: number[]): boolean {
  return pool.some(
    (val) =>
      player.pieces.some((p) => canMovePiece(allPlayers, player, p, val)) ||
      player.pieces.some((p) => !p.isGatti && canFormGatti(player, p.pos, val))
  );
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

// moverIsGatti distinguishes the two capture regimes the gatti-tollu requirement adds on top of
// the plain "land on it, it's captured" rule this function always had:
// - A single piece lands on an opponent's tollu (2 pieces, not yet bonded): only one of the two is
//   captured, the other is left behind, no longer part of a tollu.
// - A single piece lands on an opponent's gatti: no capture at all — a single piece can never
//   capture a gatti, they simply coexist on that cell (see opponentGattiBlocksCrossing above for
//   what happens if that gatti later moves away instead).
// - A gatti lands on anything (a lone piece, a whole tollu, or an opposing gatti): every piece
//   occupying that cell is captured.
export function resolveCaptures(
  players: Player[],
  movingPlayer: Player,
  targetCoord: Coord,
  moverIsGatti = false
): CaptureResult[] {
  if (isSafeCell(targetCoord)) return [];
  const captured: CaptureResult[] = [];
  for (const opp of players) {
    if (opp.id === movingPlayer.id || opp.hasLost) continue;
    const here = opp.pieces.filter((p) => isSameCell(coordAt(opp.id, p.pos), targetCoord));
    if (here.length === 0) continue;

    if (!moverIsGatti && here.some((p) => p.isGatti)) continue;

    if (moverIsGatti) {
      here.forEach((p) => captured.push({ player: opp, piece: p }));
    } else {
      captured.push({ player: opp, piece: here[0] });
    }
  }
  return captured;
}

// A gatti moving away exposes any opposing single piece that had been resting on its old cell
// (unable to cross it — see opponentGattiBlocksCrossing) — captured the instant the gatti departs.
function capturePiecesLeftBehind(players: Player[], movingPlayer: Player, vacatedCoord: Coord): CaptureResult[] {
  if (isSafeCell(vacatedCoord)) return [];
  const captured: CaptureResult[] = [];
  for (const opp of players) {
    if (opp.id === movingPlayer.id || opp.hasLost) continue;
    for (const p of opp.pieces) {
      if (!p.isGatti && isSameCell(coordAt(opp.id, p.pos), vacatedCoord)) captured.push({ player: opp, piece: p });
    }
  }
  return captured;
}

function applyCaptures(captured: CaptureResult[], movingPlayer: Player): void {
  captured.forEach(({ piece: p }) => {
    p.pos = 0;
    p.isGatti = false; // sent home — both members of a captured tollu/gatti are unbonded
  });
  if (captured.length > 0) movingPlayer.hasCaptured = true;
}

function checkFinished(player: Player): void {
  if (player.pieces.every((p) => p.pos === FINISH_POS)) player.isFinished = true;
}

export function movePiece(players: Player[], player: Player, piece: Piece, val: number): CaptureResult[] {
  if (piece.isGatti) {
    const step = gattiStepFor(val)!; // caller must have already checked canMovePiece
    const oldPos = piece.pos;
    const oldCoord = coordAt(player.id, oldPos);
    const sibling = player.pieces.find((p) => p !== piece && p.isGatti && p.pos === oldPos)!;
    piece.pos += step;
    sibling.pos += step;
    const targetCoord = coordAt(player.id, piece.pos);

    const captured = [
      ...resolveCaptures(players, player, targetCoord, true),
      ...capturePiecesLeftBehind(players, player, oldCoord),
    ];
    applyCaptures(captured, player);
    checkFinished(player);
    return captured;
  }

  piece.pos += val;
  const targetCoord = coordAt(player.id, piece.pos);
  const captured = resolveCaptures(players, player, targetCoord, false);
  applyCaptures(captured, player);
  checkFinished(player);
  return captured;
}

// Bonds an existing tollu into a permanent gatti and advances both pieces together by 1 square —
// the only way a gatti is ever formed (see canFormGatti). Delegates to movePiece's own gatti
// branch for the actual move/capture resolution once both pieces are flagged, so a capture made on
// this very forming move (landing on an opponent occupying the next cell) behaves identically to
// any other gatti move.
export function formGatti(players: Player[], player: Player, pos: number): CaptureResult[] {
  const pair = tolluAt(player, pos)!;
  pair.forEach((p) => {
    p.isGatti = true;
  });
  return movePiece(players, player, pair[0], 2);
}
