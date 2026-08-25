import { pool } from '../db/pool';
import { computePlacements } from '@chowka/game-core/session';
import type { GameState } from '@chowka/game-core/turnEngine';

type StatField = 'first' | 'second' | 'third' | 'losses';

// field is always one of the fixed literals above (never request input), so interpolating it
// into the column name here is safe despite not being parameterized.
async function bumpStat(playerId: string, field: StatField): Promise<void> {
  await pool.query(
    `insert into player_stats (player_id, games, ${field}) values ($1, 1, 1)
     on conflict (player_id) do update set games = player_stats.games + 1, ${field} = player_stats.${field} + 1`,
    [playerId]
  );
}

// Reuses game-core's own placement/loss rules (computePlacements) so "who won" is determined
// identically here and in the local hotseat game — only the persistence target differs (a real
// player_id looked up via this game's seats, vs. the hotseat's name-keyed localStorage).
export async function recordGameFinished(gameId: string, state: GameState): Promise<void> {
  const seatsResult = await pool.query('select seat, player_id from game_seats where game_id = $1', [gameId]);
  const playerIdBySeat = new Map<string, string>(seatsResult.rows.map((r) => [r.seat as string, r.player_id as string]));

  for (const p of computePlacements(state)) {
    const playerId = playerIdBySeat.get(p.playerId);
    if (!playerId) continue;
    if (p.isLoss) await bumpStat(playerId, 'losses');
    else if (p.place === 1) await bumpStat(playerId, 'first');
    else if (p.place === 2) await bumpStat(playerId, 'second');
    else if (p.place === 3) await bumpStat(playerId, 'third');
  }
}

// Recorded the moment someone declines an invite, not deferred to game-end — the game may not
// even start yet, or may never start, but the decline itself already happened.
export async function recordPlayerDeclined(playerId: string): Promise<void> {
  await pool.query(
    `insert into player_stats (player_id, games, declined) values ($1, 1, 1)
     on conflict (player_id) do update set games = player_stats.games + 1, declined = player_stats.declined + 1`,
    [playerId]
  );
}
