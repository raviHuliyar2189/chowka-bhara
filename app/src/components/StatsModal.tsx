import { EMPTY_STATS, type PlayerStats } from '../game/storage';

interface Props {
  name: string;
  stats?: PlayerStats;
  onClose: () => void;
}

export default function StatsModal({ name, stats, onClose }: Props) {
  const s = stats ?? EMPTY_STATS;
  const g = s.games || 1;
  const pct = (n: number) => `${((n / g) * 100).toFixed(1)}%`;

  return (
    <div className="overlay">
      <div className="modal">
        <h3>{name}'s Lifetime Stats</h3>
        <table>
          <tbody>
            <tr>
              <th>Total Games Played</th>
              <td>{s.games}</td>
            </tr>
            <tr>
              <th>1st Win</th>
              <td>{pct(s.first)}</td>
            </tr>
            <tr>
              <th>2nd Win</th>
              <td>{pct(s.second)}</td>
            </tr>
            <tr>
              <th>3rd Win</th>
              <td>{pct(s.third)}</td>
            </tr>
            <tr>
              <th>Loss</th>
              <td>{pct(s.losses)}</td>
            </tr>
            <tr>
              <th>Aborted</th>
              <td>{pct(s.aborted)}</td>
            </tr>
          </tbody>
        </table>
        <button className="action-btn" style={{ width: '100%', marginTop: 15 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
