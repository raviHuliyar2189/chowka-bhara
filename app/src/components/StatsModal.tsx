import { EMPTY_STATS, type PlayerStats } from '../game/storage';
import { useT } from '../i18n/strings';

interface Props {
  name: string;
  stats?: PlayerStats;
  onClose: () => void;
}

export default function StatsModal({ name, stats, onClose }: Props) {
  const t = useT();
  const s = stats ?? EMPTY_STATS;
  const g = s.games || 1;
  const pct = (n: number) => `${((n / g) * 100).toFixed(1)}%`;

  return (
    <div className="overlay">
      <div className="modal">
        <h3>{t('stats.title', name)}</h3>
        <table>
          <tbody>
            <tr>
              <th>{t('stats.totalGames')}</th>
              <td>{s.games}</td>
            </tr>
            <tr>
              <th>{t('stats.firstWin')}</th>
              <td>{pct(s.first)}</td>
            </tr>
            <tr>
              <th>{t('stats.secondWin')}</th>
              <td>{pct(s.second)}</td>
            </tr>
            <tr>
              <th>{t('stats.thirdWin')}</th>
              <td>{pct(s.third)}</td>
            </tr>
            <tr>
              <th>{t('stats.loss')}</th>
              <td>{pct(s.losses)}</td>
            </tr>
            <tr>
              <th>{t('stats.aborted')}</th>
              <td>{pct(s.aborted)}</td>
            </tr>
          </tbody>
        </table>
        <button className="action-btn" style={{ width: '100%', marginTop: 15 }} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
