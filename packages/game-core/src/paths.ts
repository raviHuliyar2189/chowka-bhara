export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4';
export type Coord = [number, number];

// Shared between the local hotseat UI (app/src/App.tsx) and the online server (which assigns
// these when starting a game from a lobby) — one definition so the two can never drift apart.
export const PLAYER_COLORS: Record<PlayerId, string> = {
  P1: '#b03a2e',
  P2: '#2e5f8a',
  P3: '#3f7d4f',
  P4: '#c07a12',
};

// Same reasoning as PLAYER_COLORS above — the ordered seat list for a given player count, shared
// between the online server (seat assignment) and client (lobby placeholder rendering) so they
// can't drift apart. 2-player games sit at opposite bases (P1/P3), not any arbitrary pair.
// 1 is a real, valid seat count — see AI_SEAT below: "1 player" always secretly becomes a 2-seat
// game against the AI, so P1 is the only seat any of this ever assigns to a real (human) player.
export const SEATS_BY_COUNT: Record<number, PlayerId[]> = {
  1: ['P1'],
  2: ['P1', 'P3'],
  3: ['P1', 'P2', 'P3'],
  4: ['P1', 'P2', 'P3', 'P4'],
};

// The AI opponent's seat and display name, whenever a mode's "1 player" option is used (hotseat,
// Develop Test, and online all secretly play the same 2-seat game against this same AI — see each
// mode's own AI-driving code). Shared here so hotseat/Vs Computer (client-driven) and the online
// server (server-driven, no client ever sitting at this seat) can never drift apart on which seat
// or name means "this is the computer, not a real player."
export const AI_SEAT: PlayerId = 'P3';
export const AI_NAME = 'Indramma';

// P1's 25-step path: index 0 = home, 1-15 = outer ring, 16-23 = inner ring, 24 = center.
const P1_PATH: Coord[] = [
  [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0],
  [1, 0], [2, 0], [3, 0], [4, 0], [4, 1],
  [3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2],
  [2, 2],
];

// Exported so the board UI can reuse this exact same transform to rotate the *display* — showing
// each viewer their own base at the bottom — while every game-logic coordinate (PATHS,
// BASE_POSITIONS, a piece's actual position) stays in this canonical P1-at-bottom frame.
export function rotateCoord([r, c]: Coord, times: number): Coord {
  let cur: Coord = [r, c];
  for (let i = 0; i < times; i++) {
    cur = [4 - cur[1], cur[0]];
  }
  return cur;
}

export const PATHS: Record<PlayerId, Coord[]> = {
  P1: P1_PATH,
  P2: P1_PATH.map((pt) => rotateCoord(pt, 1)),
  P3: P1_PATH.map((pt) => rotateCoord(pt, 2)),
  P4: P1_PATH.map((pt) => rotateCoord(pt, 3)),
};

export const BASE_POSITIONS: Record<PlayerId, Coord> = {
  P1: PATHS.P1[0],
  P2: PATHS.P2[0],
  P3: PATHS.P3[0],
  P4: PATHS.P4[0],
};

export const CENTER: Coord = [2, 2];

// The 5 cells safe for everyone: all 4 home bases + the shared center.
export const SAFE_CELLS: Coord[] = [
  BASE_POSITIONS.P1,
  BASE_POSITIONS.P2,
  BASE_POSITIONS.P3,
  BASE_POSITIONS.P4,
  CENTER,
];

export const INNER_RING_START = 16;
export const INNER_RING_END = 23;
export const FINISH_POS = 24;

export function coordAt(playerId: PlayerId, pos: number): Coord {
  return PATHS[playerId][pos];
}

// The reverse of coordAt — which path position of this player's own path a given board
// coordinate corresponds to. Every player's 25-cell path is a Hamiltonian route over the whole
// 5x5 board (1 home + 15 outer + 8 inner + 1 center = 25 cells), so this only ever returns null
// for a coordinate that isn't a real board cell at all, never a "not on this path" case.
export function pathPositionAt(playerId: PlayerId, coord: Coord): number | null {
  const path = PATHS[playerId];
  for (let pos = 0; pos < path.length; pos++) {
    if (isSameCell(path[pos], coord)) return pos;
  }
  return null;
}

export function isSameCell(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function isSafeCell(coord: Coord): boolean {
  return SAFE_CELLS.some((c) => isSameCell(c, coord));
}
