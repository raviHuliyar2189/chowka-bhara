// PlayerStats/EMPTY_STATS live in @chowka/game-core (packages/game-core/src/session.ts) now —
// imported (for local use below) and re-exported (so existing imports of them from './storage'
// keep working unchanged). Local browser persistence (below) is app-specific and stays here.
import { type PlayerStats, EMPTY_STATS } from '@chowka/game-core/session';
export type { PlayerStats };
export { EMPTY_STATS };

const ROSTER_KEY = 'chowka-bhara:roster';
const STATS_KEY = 'chowka-bhara:stats';

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private browsing, quota exceeded, etc. — stats just won't persist this time
  }
}

export function loadRoster(): string[] {
  return safeGet<string[]>(ROSTER_KEY, []);
}

export function saveRoster(names: string[]): void {
  safeSet(ROSTER_KEY, Array.from(new Set(names)));
}

export function loadStats(): Record<string, PlayerStats> {
  return safeGet<Record<string, PlayerStats>>(STATS_KEY, {});
}

export function saveStats(stats: Record<string, PlayerStats>): void {
  safeSet(STATS_KEY, stats);
}
