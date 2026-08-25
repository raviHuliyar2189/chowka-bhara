import { useState } from 'react';
import type { PlayerId } from '../game/paths';
import type { SetupPlayer } from '../hotseat/HotseatPage';
import { useT } from '../i18n/strings';

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
            <option value={2}>{t('setup.nPlayers', 2)}</option>
            <option value={3}>{t('setup.nPlayers', 3)}</option>
            <option value={4}>{t('setup.nPlayers', 4)}</option>
          </select>
        </div>

        {seats.map((id, i) => (
          <div key={id} className="setup-row">
            <label className="setup-label">{t('setup.seatName', `${id} (${t(SEAT_SIDE_KEY[id])})`)}</label>
            <div className="setup-input-group">
              <input
                value={names[i]}
                placeholder={t('setup.namePlaceholder', i + 1)}
                onChange={(e) => updateName(i, e.target.value)}
              />
              {/* A plain <select> rather than <input list>/<datalist>: many browsers (Chrome
                  included) stop reopening a datalist's suggestions once the field's value exactly
                  matches one of them, so picking a different roster name required clearing the
                  field first. A real <select> has no such quirk — it always reopens on click,
                  letting the same picker be used to switch players as many times as needed. Reset
                  back to the placeholder option after every pick so choosing the same name twice
                  in a row still fires a change event. */}
              {roster.length > 0 && (
                <select
                  className="roster-picker"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) updateName(i, e.target.value);
                    e.target.value = '';
                  }}
                  aria-label={t('setup.pickFromRoster')}
                >
                  <option value="">{t('setup.pickFromRoster')}</option>
                  {roster.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>
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
      </div>
    </div>
  );
}
