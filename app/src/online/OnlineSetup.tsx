import { useState } from 'react';
import { createGame } from './api';
import { useT } from '../i18n/strings';

interface Props {
  onCreated: (gameId: string) => void;
}

export default function OnlineSetup({ onCreated }: Props) {
  const t = useT();
  const [count, setCount] = useState(2);
  const [resignAllowed, setResignAllowed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const game = await createGame(count, resignAllowed);
      onCreated(game.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onlineSetup.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal">
      <h2>{t('onlineSetup.title')}</h2>
      <div className="setup-row">
        <label className="setup-label" htmlFor="onlineCount">
          {t('setup.numberOfPlayers')}
        </label>
        <select id="onlineCount" value={count} onChange={(e) => setCount(Number(e.target.value))}>
          <option value={2}>{t('setup.nPlayers', 2)}</option>
          <option value={3}>{t('setup.nPlayers', 3)}</option>
          <option value={4}>{t('setup.nPlayers', 4)}</option>
        </select>
      </div>
      <p>{t('onlineSetup.linkNote')}</p>

      <div className="sound-prompt">
        <div className="sound-prompt-question">{t('setup.resignAllowedQuestion')}</div>
        <button
          className={`btn-sound ${resignAllowed ? 'is-on' : 'is-off'}`}
          onClick={() => setResignAllowed((v) => !v)}
          title={resignAllowed ? t('setup.resignDisableTitle') : t('setup.resignEnableTitle')}
        >
          {resignAllowed ? t('setup.resignOn') : t('setup.resignOff')}
        </button>
      </div>

      {error && <p className="online-error">{error}</p>}
      <button className="action-btn btn-start" onClick={handleCreate} disabled={creating}>
        {creating ? t('onlineSetup.creating') : t('onlineSetup.createGame')}
      </button>
    </div>
  );
}
