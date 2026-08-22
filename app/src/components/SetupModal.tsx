import { useState } from 'react';
import type { PlayerId } from '../game/paths';
import type { SetupPlayer } from '../hotseat/HotseatPage';

interface Props {
  roster: string[];
  onStart: (players: SetupPlayer[]) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  rollbackEnabled: boolean;
  onToggleRollback: () => void;
}

const SEATS: Record<number, PlayerId[]> = {
  2: ['P1', 'P3'],
  3: ['P1', 'P2', 'P3'],
  4: ['P1', 'P2', 'P3', 'P4'],
};

const SEAT_LABELS: Record<PlayerId, string> = {
  P1: 'P1 (Bottom)',
  P2: 'P2 (Right)',
  P3: 'P3 (Top)',
  P4: 'P4 (Left)',
};

export default function SetupModal({
  roster,
  onStart,
  soundOn,
  onToggleSound,
  rollbackEnabled,
  onToggleRollback,
}: Props) {
  const [count, setCount] = useState(4);
  const [names, setNames] = useState<string[]>(['', '', '', '']);
  const seats = SEATS[count];

  function updateName(i: number, value: string) {
    const next = [...names];
    next[i] = value;
    setNames(next);
  }

  function handleStart() {
    const players: SetupPlayer[] = seats.map((id, i) => ({
      id,
      name: names[i].trim() || `Player ${i + 1}`,
    }));
    onStart(players);
  }

  return (
    <div className="setup-inline">
      <div className="modal">
        <h2>Select Players</h2>
        <div className="setup-row">
          <label className="setup-label" htmlFor="playerCount">
            Number of Players:
          </label>
          <select id="playerCount" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={2}>2 Players</option>
            <option value={3}>3 Players</option>
            <option value={4}>4 Players</option>
          </select>
        </div>

        {seats.map((id, i) => (
          <div key={id} className="setup-row">
            <label className="setup-label">{SEAT_LABELS[id]} Name:</label>
            <input
              list="roster-list"
              value={names[i]}
              placeholder={`Player ${i + 1}`}
              onChange={(e) => updateName(i, e.target.value)}
            />
          </div>
        ))}
        <datalist id="roster-list">
          {roster.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="sound-prompt">
          <div className="sound-prompt-question">Announcements</div>
          <button
            className={`btn-sound ${soundOn ? 'is-on' : 'is-off'}`}
            onClick={onToggleSound}
            title={soundOn ? 'Mute announcements' : 'Unmute announcements'}
          >
            {soundOn ? '🔊 Sound: On' : '🔇 Sound: Off'}
          </button>
        </div>

        <div className="sound-prompt">
          <div className="sound-prompt-question">Roll back last move</div>
          <button
            className={`btn-sound ${rollbackEnabled ? 'is-on' : 'is-off'}`}
            onClick={onToggleRollback}
            title={rollbackEnabled ? 'Disable roll-back' : 'Enable roll-back'}
          >
            {rollbackEnabled ? '⟲ Roll Back: On' : '⟲ Roll Back: Off'}
          </button>
        </div>

        <button className="action-btn btn-start" onClick={handleStart}>
          Start Game
        </button>
      </div>
    </div>
  );
}
