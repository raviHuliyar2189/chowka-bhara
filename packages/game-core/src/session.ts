import type { GameState } from './turnEngine';

// Lifetime per-player stats. Lives here (not in app's storage.ts) since it's the shape both the
// browser's localStorage persistence AND a future server's database persistence need to agree on
// — this file's own applyPlacementsToStats/applyAbortToStats are what actually mutate it.
export interface PlayerStats {
  games: number; // includes aborted games
  first: number;
  second: number;
  third: number;
  losses: number;
  aborted: number;
}

export const EMPTY_STATS: PlayerStats = { games: 0, first: 0, second: 0, third: 0, losses: 0, aborted: 0 };

export interface PlacementEntry {
  playerId: string;
  name: string;
  place: number; // 1-based
  isLoss: boolean;
}

// The last-place finisher of a game counts as a "loss" (not also as their ordinal place),
// so a 2-player runner-up and a 4-player last-place finisher both land in the loss bucket.
export function computePlacements(state: GameState): PlacementEntry[] {
  return state.rankings.map((id, idx) => {
    const player = state.players.find((p) => p.id === id)!;
    const place = idx + 1;
    const isLoss = place === state.players.length;
    return { playerId: id, name: player.name, place, isLoss };
  });
}

export function applyPlacementsToStats(
  stats: Record<string, PlayerStats>,
  placements: PlacementEntry[]
): Record<string, PlayerStats> {
  const next = { ...stats };
  for (const p of placements) {
    const existing = next[p.name] ?? EMPTY_STATS;
    const updated = { ...existing, games: existing.games + 1 };
    if (p.isLoss) updated.losses += 1;
    else if (p.place === 1) updated.first += 1;
    else if (p.place === 2) updated.second += 1;
    else if (p.place === 3) updated.third += 1;
    next[p.name] = updated;
  }
  return next;
}

// A fully-aborted game (every player agreed) never produces placements, but it still counts
// toward each player's total games played, tracked separately as "aborted" rather than folded
// into wins/losses.
export function applyAbortToStats(
  stats: Record<string, PlayerStats>,
  playerNames: string[]
): Record<string, PlayerStats> {
  const next = { ...stats };
  for (const name of playerNames) {
    const existing = next[name] ?? EMPTY_STATS;
    next[name] = { ...existing, games: existing.games + 1, aborted: existing.aborted + 1 };
  }
  return next;
}
