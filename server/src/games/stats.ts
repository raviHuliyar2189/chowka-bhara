import { pool } from '../db/pool';
import { computePlacements } from '@chowka/game-core/session';
import type { GameState } from '@chowka/game-core/turnEngine';

type PlacementField = 'first' | 'second' | 'third' | 'losses';

// Bucketed by the game's originally-planned seat count (1/2/3/4), not however many actually ended
// up playing — matches what the creator chose at setup, including online's "N planned, some
// declined" case. A "1 player" game (hotseat/online's own "secretly play the AI" option — see
// REQUIREMENTS.md §9/§13) always lands in the 1p bucket even though it's a real 2-seat game
// underneath, since from this human's perspective it was a single-player game.
function seatCountColumn(seatCount: number): 'games_1p' | 'games_2p' | 'games_3p' | 'games_4p' {
  switch (seatCount) {
    case 1:
      return 'games_1p';
    case 2:
      return 'games_2p';
    case 3:
      return 'games_3p';
    default:
      return 'games_4p';
  }
}

// field/seatCountField are always one of the fixed literals above (never request input), so
// interpolating them into the column names here is safe despite not being parameterized.
async function bumpStat(
  playerId: string,
  field: PlacementField,
  seatCountField: string,
  resigned: boolean
): Promise<void> {
  await pool.query(
    `insert into player_stats (player_id, games, ${field}, ${seatCountField}, resigned)
     values ($1, 1, 1, 1, $2)
     on conflict (player_id) do update set
       games = player_stats.games + 1,
       ${field} = player_stats.${field} + 1,
       ${seatCountField} = player_stats.${seatCountField} + 1,
       resigned = player_stats.resigned + $2`,
    [playerId, resigned ? 1 : 0]
  );
}

// Reuses game-core's own placement/loss rules (computePlacements) so "who won" is determined
// identically here and in the local hotseat game — only the persistence target differs (a real
// player_id looked up via this game's seats, vs. the hotseat's name-keyed localStorage).
//
// resignedNames: display names of whoever resigned to end (or continue) this game — passed
// through from resign.ts's own applyAndBroadcast call so a resignation-caused finish also bumps
// the "resigned" stat, on top of the normal placement it already gets (§8: resigning is still just
// a forfeit/Loss, not a separate outcome — resigned is an informational sub-count, not exclusive
// with losses).
export async function recordGameFinished(gameId: string, state: GameState, resignedNames: string[] = []): Promise<void> {
  const gameResult = await pool.query('select seat_count from games where id = $1', [gameId]);
  const seatCountField = seatCountColumn((gameResult.rows[0]?.seat_count as number | undefined) ?? 4);

  const seatsResult = await pool.query('select seat, player_id from game_seats where game_id = $1', [gameId]);
  const playerIdBySeat = new Map<string, string>(seatsResult.rows.map((r) => [r.seat as string, r.player_id as string]));

  for (const p of computePlacements(state)) {
    // The AI seat (online's own "1 player" option — see gameplay.ts's maybeScheduleAiTurn) has no
    // game_seats row at all, so it's correctly skipped here — there's no real player_id to credit.
    const playerId = playerIdBySeat.get(p.playerId);
    if (!playerId) continue;
    const resigned = resignedNames.includes(p.name);
    if (p.isLoss) await bumpStat(playerId, 'losses', seatCountField, resigned);
    else if (p.place === 1) await bumpStat(playerId, 'first', seatCountField, resigned);
    else if (p.place === 2) await bumpStat(playerId, 'second', seatCountField, resigned);
    else if (p.place === 3) await bumpStat(playerId, 'third', seatCountField, resigned);
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
