import { useState } from 'react';
import type { PlayerId } from '../game/paths';
import type { SetupPlayer } from '../hotseat/HotseatPage';
import { useT } from '../i18n/strings';
import AccountControls from './AccountControls';

interface Props {
  roster: string[];
  onStart: (players: SetupPlayer[]) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  rollbackEnabled: boolean;
  onToggleRollback: () => void;
  resignAllowed: boolean;
  onToggleResignAllowed: () => void;
}

const SEATS: Record<number, PlayerId[]> = {
  1: ['P1'],
  2: ['P1', 'P3'],
  3: ['P1', 'P2', 'P3'],
  4: ['P1', 'P2', 'P3', 'P4'],
};

const SEAT_SIDE_KEY: Record<PlayerId, string> = {
  P1: 'side.bottom',
  P2: 'side.right',
  P3: 'side.top',
  P4: 'side.left',
};

export default function SetupModal({
  roster,
  onStart,
  soundOn,
  onToggleSound,
  rollbackEnabled,
  onToggleRollback,
  resignAllowed,
  onToggleResignAllowed,
}: Props) {
  const t = useT();
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
      name: names[i].trim() || t('setup.namePlaceholder', i + 1),
    }));
    onStart(players);
  }

  return (
    <div className="setup-inline">
      <div className="modal">
        <h2>{t('setup.title')}</h2>
        <div className="setup-row">
          <label className="setup-label" htmlFor="playerCount">
            {t('setup.numberOfPlayers')}
          </label>
          <select id="playerCount" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={1}>{t('setup.nPlayers', 1)}</option>
            <option value={2}>{t('setup.nPlayers', 2)}</option>
            <option value={3}>{t('setup.nPlayers', 3)}</option>
            <option value={4}>{t('setup.nPlayers', 4)}</option>
          </select>
        </div>

        {seats.map((id, i) => (
          <div key={id} className="setup-row">
            <label className="setup-label" htmlFor={`playerName-${id}`}>
              {t('setup.seatName', `${id} (${t(SEAT_SIDE_KEY[id])})`)}
            </label>
            {/* One box: typing a new name and picking a roster name both happen in the same
                input, via its native datalist suggestions, instead of a separate name field plus
                a second roster-picker dropdown next to it. */}
            <input
              id={`playerName-${id}`}
              list={roster.length > 0 ? `roster-${id}` : undefined}
              autoComplete="off"
              value={names[i]}
              placeholder={t('setup.namePlaceholder', i + 1)}
              onChange={(e) => updateName(i, e.target.value)}
            />
            {roster.length > 0 && (
              <datalist id={`roster-${id}`}>
                {roster.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            )}
          </div>
        ))}

        <div className="sound-prompt">
          <div className="sound-prompt-question">{t('setup.announcements')}</div>
          <button
            className={`btn-sound ${soundOn ? 'is-on' : 'is-off'}`}
            onClick={onToggleSound}
            title={soundOn ? t('setup.muteTitle') : t('setup.unmuteTitle')}
          >
            {soundOn ? t('setup.soundOn') : t('setup.soundOff')}
          </button>
        </div>

        <div className="sound-prompt">
          <div className="sound-prompt-question">{t('setup.rollbackQuestion')}</div>
          <button
            className={`btn-sound ${rollbackEnabled ? 'is-on' : 'is-off'}`}
            onClick={onToggleRollback}
            title={rollbackEnabled ? t('setup.rollbackDisableTitle') : t('setup.rollbackEnableTitle')}
          >
            {rollbackEnabled ? t('setup.rollbackOn') : t('setup.rollbackOff')}
          </button>
        </div>

        <div className="sound-prompt">
          <div className="sound-prompt-question">{t('setup.resignAllowedQuestion')}</div>
          <button
            className={`btn-sound ${resignAllowed ? 'is-on' : 'is-off'}`}
            onClick={onToggleResignAllowed}
            title={resignAllowed ? t('setup.resignDisableTitle') : t('setup.resignEnableTitle')}
          >
            {resignAllowed ? t('setup.resignOn') : t('setup.resignOff')}
          </button>
        </div>

        <button className="action-btn btn-start" onClick={handleStart}>
          {t('setup.startGame')}
        </button>

        <AccountControls />
      </div>
    </div>
  );
}
