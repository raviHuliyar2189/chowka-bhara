import type { PlacementEntry } from '../game/session';
import { EMPTY_STATS, type PlayerStats } from '../game/storage';
import { useT } from '../i18n/strings';

interface Props {
  placements: PlacementEntry[];
  sessionResults: { players: string[]; placements: PlacementEntry[] }[];
  stats: Record<string, PlayerStats>;
  onRematch: () => void;
  onNewSession: () => void;
  onShowStats: (name: string) => void;
}

export default function ResultsModal({ placements, sessionResults, stats, onRematch, onNewSession, onShowStats }: Props) {
  const t = useT();
  const names = Array.from(new Set(sessionResults.flatMap((g) => g.players)));

  return (
    <div className="overlay">
      <div className="modal">
        <h2>{t('results.gameFinished')}</h2>
        <ol>
          {placements.map((p) => (
            <li key={p.playerId}>
              <strong>{p.name}</strong> ({p.playerId}) — {p.isLoss ? t('results.loss') : t('results.place', p.place)}
            </li>
          ))}
        </ol>

        <h3>{t('results.sessionSummary', sessionResults.length)}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('results.player')}</th>
                <th>{t('results.games')}</th>
                <th>{t('results.firstWinPct')}</th>
                <th>{t('results.secondWinPct')}</th>
                <th>{t('results.thirdWinPct')}</th>
                <th>{t('results.lossPct')}</th>
                <th>{t('results.resignedPct')}</th>
              </tr>
            </thead>
            <tbody>
              {names.map((name) => {
                // See StatsModal.tsx's own copy of this same normalization comment.
                const s: PlayerStats = { ...EMPTY_STATS, ...stats[name] };
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
                    <td>{((s.resigned / g) * 100).toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="actions-row">
          <button className="action-btn" onClick={onRematch}>
            {t('results.playAgain')}
          </button>
          <button className="action-btn btn-abort" onClick={onNewSession}>
            {t('results.endSession')}
          </button>
        </div>
      </div>
    </div>
  );
}
