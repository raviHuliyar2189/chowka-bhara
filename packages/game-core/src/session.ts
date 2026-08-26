import type { GameState } from './turnEngine';

// Lifetime per-player stats. Lives here (not in app's storage.ts) since it's the shape both the
// browser's localStorage persistence AND the server's database persistence need to agree on —
// this file's own applyPlacementsToStats is what actually mutates it (client-side; the server has
// its own SQL equivalent in server/src/games/stats.ts, kept in step with this shape by hand).
export interface PlayerStats {
  games: number;
  first: number;
  second: number;
  third: number;
  losses: number;
  // Informational sub-count, not exclusive with losses — a resignation is still just a forfeit/
  // Loss (§8), this just additionally tracks how many of a player's games ended that way.
  resigned: number;
  // How many games this player has played at each seat count, bucketed by whatever was originally
  // selected at setup (1/2/3/4) — not however many people actually ended up playing. "1" always
  // means the solo-vs-AI option (hotseat/online's own "1 player" choice, or Vs Computer, which is
  // this experience by construction) even though it's a real 2-seat game underneath.
  games1p: number;
  games2p: number;
  games3p: number;
  games4p: number;
}

export const EMPTY_STATS: PlayerStats = {
  games: 0,
  first: 0,
  second: 0,
  third: 0,
  losses: 0,
  resigned: 0,
  games1p: 0,
  games2p: 0,
  games3p: 0,
  games4p: 0,
};

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

// seatCount: the game's originally-selected player count (1-4) — see PlayerStats.games1p's own
// comment for why 1 always means "played solo against the AI," not literally one participant.
// resignedNames: display names of whoever resigned to end (or continue) this game, if any — every
// caller that isn't specifically handling a resignation just omits it.
export function applyPlacementsToStats(
  stats: Record<string, PlayerStats>,
  placements: PlacementEntry[],
  seatCount: number,
  resignedNames: string[] = []
): Record<string, PlayerStats> {
  const next = { ...stats };
  for (const p of placements) {
    // Backfills any fields missing from an existing entry (e.g. a player recorded before
    // resigned/games1p-4p existed) with EMPTY_STATS's defaults, rather than carrying forward
    // `undefined` — which would otherwise poison every arithmetic on that field from here on
    // (NaN once incremented, NaN% once divided for a percentage) for the rest of that player's
    // history.
    const existing: PlayerStats = { ...EMPTY_STATS, ...next[p.name] };
    const updated: PlayerStats = { ...existing, games: existing.games + 1 };
    if (p.isLoss) updated.losses += 1;
    else if (p.place === 1) updated.first += 1;
    else if (p.place === 2) updated.second += 1;
    else if (p.place === 3) updated.third += 1;
    if (resignedNames.includes(p.name)) updated.resigned += 1;
    if (seatCount === 1) updated.games1p += 1;
    else if (seatCount === 2) updated.games2p += 1;
    else if (seatCount === 3) updated.games3p += 1;
    else if (seatCount === 4) updated.games4p += 1;
    next[p.name] = updated;
  }
  return next;
}
