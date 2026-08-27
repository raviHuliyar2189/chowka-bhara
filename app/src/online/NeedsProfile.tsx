import { useState, type FormEvent } from 'react';
import { signup, type PlayerInfo } from './api';
import { useT } from '../i18n/strings';

interface Props {
  phone: string;
  onDone: (player: PlayerInfo) => void;
}

export default function NeedsProfile({ phone, onDone }: Props) {
  const t = useT();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError(t('auth.displayNameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await signup(phone, trimmed);
      onDone(result.player);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.createAccountFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal">
      <h2>{t('auth.noAccountTitle')}</h2>
      <p>{t('auth.pickDisplayName')}</p>
      <form onSubmit={handleSubmit}>
        <div className="setup-row">
          <label className="setup-label" htmlFor="displayName">
            {t('auth.displayNameLabel')}
          </label>
          <input
            id="displayName"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Ravi"
            maxLength={40}
          />
        </div>
        {error && <p className="online-error">{error}</p>}
        <button className="action-btn btn-start" type="submit" disabled={saving}>
          {saving ? t('auth.creating') : t('auth.createAccount')}
        </button>
      </form>
    </div>
  );
}
