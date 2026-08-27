import { useState, type FormEvent } from 'react';
import { login, type PlayerInfo } from './api';
import { useT } from '../i18n/strings';
import LanguageToggle from '../components/LanguageToggle';

interface Props {
  onLoggedIn: (player: PlayerInfo) => void;
  onNoAccount: (phone: string) => void;
}

export default function OnlineLogin({ onLoggedIn, onNoAccount }: Props) {
  const t = useT();
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();
    // type="tel" (unlike type="email") has no built-in browser format check — this mirrors the
    // server's own normalizePhone() digit-count validation (7-15 digits) so an obviously-wrong
    // number is caught immediately instead of waiting on a round trip.
    const digitCount = trimmed.replace(/[^\d]/g, '').length;
    if (digitCount < 7 || digitCount > 15) {
      setError(t('auth.phoneInvalid'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await login(trimmed);
      if (result.status === 'no-account') {
        onNoAccount(result.phone);
      } else {
        onLoggedIn(result.player);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal">
      <p className="screen-app-title">{t('app.title')}</p>
      <div className="screen-heading-row">
        <h2>{t('auth.signInTitle')}</h2>
        <LanguageToggle />
      </div>
      <p>{t('auth.signInPrompt')}</p>
      <form onSubmit={handleSubmit}>
        <div className="setup-row">
          <label className="setup-label" htmlFor="onlinePhone">
            {t('auth.phoneLabel')}
          </label>
          <input
            id="onlinePhone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
        {error && <p className="online-error">{error}</p>}
        <button className="action-btn btn-start" type="submit" disabled={sending}>
          {sending ? t('auth.checking') : t('auth.continue')}
        </button>
      </form>
    </div>
  );
}
