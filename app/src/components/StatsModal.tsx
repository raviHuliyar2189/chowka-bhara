import { EMPTY_STATS, type PlayerStats } from '../game/storage';
import { useT } from '../i18n/strings';

interface Props {
  name: string;
  stats?: PlayerStats;
  onClose: () => void;
}

export default function StatsModal({ name, stats, onClose }: Props) {
  const t = useT();
  // Backfills any fields missing from an older-shaped stored entry (see session.ts's own copy of
  // this same normalization) so a player who hasn't played since a stats-shape change doesn't show
  // NaN% until their next game silently fixes it up.
  const s: PlayerStats = { ...EMPTY_STATS, ...stats };
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
              <th>{t('stats.resigned')}</th>
              <td>{pct(s.resigned)}</td>
            </tr>
          </tbody>
        </table>

        <h4>{t('stats.breakdownTitle')}</h4>
        <table>
          <tbody>
            <tr>
              <th>{t('stats.games1p')}</th>
              <td>{s.games1p}</td>
            </tr>
            <tr>
              <th>{t('stats.games2p')}</th>
              <td>{s.games2p}</td>
            </tr>
            <tr>
              <th>{t('stats.games3p')}</th>
              <td>{s.games3p}</td>
            </tr>
            <tr>
              <th>{t('stats.games4p')}</th>
              <td>{s.games4p}</td>
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
