import { useEffect, useState } from 'react';
import { createGame } from './api';
import { useT } from '../i18n/strings';
import { setChromeHidden } from '../ui/appChrome';

interface Props {
  onCreated: (gameId: string) => void;
}

export default function OnlineSetup({ onCreated }: Props) {
  const t = useT();
  const [count, setCount] = useState(2);
  const [resignAllowed, setResignAllowed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hides the global app header's own language toggle (App.tsx's AppHeader) for this screen —
  // removed outright here, not relocated inline like mode-select/sign-in, at the user's explicit
  // request; same mechanism as those screens' own copies of this (see REQUIREMENTS.md's Decisions
  // log).
  useEffect(() => {
    setChromeHidden(true);
    return () => setChromeHidden(false);
  }, []);

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
      <p className="screen-app-title">{t('app.title')}</p>
      <h2>{t('onlineSetup.title')}</h2>
      <div className="setup-row">
        <label className="setup-label" htmlFor="onlineCount">
          {t('setup.numberOfPlayers')}
        </label>
        <select id="onlineCount" value={count} onChange={(e) => setCount(Number(e.target.value))}>
          <option value={1}>{t('setup.nPlayers', 1)}</option>
          <option value={2}>{t('setup.nPlayers', 2)}</option>
          <option value={3}>{t('setup.nPlayers', 3)}</option>
          <option value={4}>{t('setup.nPlayers', 4)}</option>
        </select>
      </div>

      {/* Moved above the divider (was below it) — a real game setting, not supporting info, so
          it belongs with the rest of the setup fields, at the user's explicit request. No
          border-top here (sound-prompt-plain overrides .sound-prompt's own) — the divider moved
          down to the info paragraph below instead. */}
      <div className="sound-prompt sound-prompt-plain">
        <div className="sound-prompt-question">{t('setup.resignAllowedQuestion')}</div>
        <button
          className={`btn-sound ${resignAllowed ? 'is-on' : 'is-off'}`}
          onClick={() => setResignAllowed((v) => !v)}
          title={resignAllowed ? t('setup.resignDisableTitle') : t('setup.resignEnableTitle')}
        >
          {resignAllowed ? t('setup.resignOn') : t('setup.resignOff')}
        </button>
      </div>

      {/* 1 player secretly plays against the same AI Vs Computer/hotseat's "1 player" use — no
          invite/WhatsApp step needed since there's no one else to send it to. Moved below the
          divider (was above it) at the user's explicit request. */}
      {count > 1 && <p className="online-setup-note">{t('onlineSetup.linkNote')}</p>}

      {error && <p className="online-error">{error}</p>}
      <button className="action-btn btn-start" onClick={handleCreate} disabled={creating}>
        {creating ? t('onlineSetup.creating') : t('onlineSetup.createGame')}
      </button>
    </div>
  );
}
