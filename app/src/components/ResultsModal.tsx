import type { PlacementEntry } from '../game/session';
import { EMPTY_STATS, type PlayerStats } from '../game/storage';

interface Props {
  placements: PlacementEntry[];
  sessionResults: { players: string[]; placements: PlacementEntry[] }[];
  stats: Record<string, PlayerStats>;
  onRematch: () => void;
  onNewSession: () => void;
  onShowStats: (name: string) => void;
}

export default function ResultsModal({
  placements,
  sessionResults,
  stats,
  onRematch,
  onNewSession,
  onShowStats,
}: Props) {
  const names = Array.from(new Set(sessionResults.flatMap((g) => g.players)));

  return (
    <div className="overlay">
      <div className="modal">
        <h2>Game Finished!</h2>
        <ol>
          {placements.map((p) => (
            <li key={p.playerId}>
              <strong>{p.name}</strong> ({p.playerId}) — {p.isLoss ? 'Loss' : `Place ${p.place}`}
            </li>
          ))}
        </ol>

        <h3>
          Session Summary ({sessionResults.length} game{sessionResults.length === 1 ? '' : 's'})
        </h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Games</th>
                <th>1st Win %</th>
                <th>2nd Win %</th>
                <th>3rd Win %</th>
                <th>Loss %</th>
                <th>Aborted %</th>
              </tr>
            </thead>
            <tbody>
              {names.map((name) => {
                const s = stats[name] ?? EMPTY_STATS;
                const g = s.games || 1;
                return (
                  <tr key={name}>
                    <td>
                      <span className="player-link" onClick={() => onShowStats(name)}>
                        {name}
                      </span>
                    </td>
                    <td>{s.games}</td>
                    <td>{((s.first / g) * 100).toFixed(0)}%</td>
                    <td>{((s.second / g) * 100).toFixed(0)}%</td>
                    <td>{((s.third / g) * 100).toFixed(0)}%</td>
                    <td>{((s.losses / g) * 100).toFixed(0)}%</td>
                    <td>{((s.aborted / g) * 100).toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button className="action-btn" style={{ width: '100%', marginTop: 15 }} onClick={onRematch}>
          Play Again (Same Players)
        </button>
        <button className="action-btn btn-abort" style={{ width: '100%', marginTop: 8 }} onClick={onNewSession}>
          End Session
        </button>
      </div>
    </div>
  );
}
