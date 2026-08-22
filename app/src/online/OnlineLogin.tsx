import { useState, type FormEvent } from 'react';
import { login, type PlayerInfo } from './api';

interface Props {
  onLoggedIn: (player: PlayerInfo) => void;
  onNoAccount: (email: string) => void;
}

export default function OnlineLogin({ onLoggedIn, onNoAccount }: Props) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    setSending(true);
    setError(null);
    try {
      const result = await login(trimmed);
      if (result.status === 'no-account') {
        onNoAccount(result.email);
      } else {
        onLoggedIn(result.player);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal">
      <h2>Sign In to Play</h2>
      <p>Enter your email to log in, or to create a new account.</p>
      <form onSubmit={handleSubmit}>
        <div className="setup-row">
          <label className="setup-label" htmlFor="onlineEmail">
            Email:
          </label>
          <input
            id="onlineEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
          />
        </div>
        {error && <p className="online-error">{error}</p>}
        <button className="action-btn btn-start" type="submit" disabled={sending}>
          {sending ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
