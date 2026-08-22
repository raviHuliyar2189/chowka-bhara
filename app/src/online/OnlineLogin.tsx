import { useState, type FormEvent } from 'react';
import { requestMagicLink } from './api';

interface Props {
  onSent: (email: string) => void;
}

export default function OnlineLogin({ onSent }: Props) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    setSending(true);
    setError(null);
    try {
      await requestMagicLink(trimmed);
      onSent(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal">
      <h2>Sign In to Play Online</h2>
      <p>Enter your email — we'll send you a link to sign in, no password needed.</p>
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
          {sending ? 'Sending…' : 'Send Sign-In Link'}
        </button>
      </form>
    </div>
  );
}
