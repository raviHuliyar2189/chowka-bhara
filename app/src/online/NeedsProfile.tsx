import { useState, type FormEvent } from 'react';
import { signup, type PlayerInfo } from './api';

interface Props {
  email: string;
  onDone: (player: PlayerInfo) => void;
}

export default function NeedsProfile({ email, onDone }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('A display name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await signup(email, trimmed);
      onDone(result.player);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal">
      <h2>No account yet for {email}</h2>
      <p>Pick a display name — this is what other players will see on the board.</p>
      <form onSubmit={handleSubmit}>
        <div className="setup-row">
          <label className="setup-label" htmlFor="displayName">
            Display Name:
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
          {saving ? 'Creating…' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}
