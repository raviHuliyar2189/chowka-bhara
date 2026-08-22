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

// P1's 25-step path: index 0 = home, 1-15 = outer ring, 16-23 = inner ring, 24 = center.
const P1_PATH: Coord[] = [
  [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0],
  [1, 0], [2, 0], [3, 0], [4, 0], [4, 1],
  [3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2],
  [2, 2],
];

function rotateCoord([r, c]: Coord, times: number): Coord {
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

export function isSameCell(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function isSafeCell(coord: Coord): boolean {
  return SAFE_CELLS.some((c) => isSameCell(c, coord));
}
