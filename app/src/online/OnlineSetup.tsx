import { useState } from 'react';
import { createGame } from './api';

interface Props {
  onCreated: (gameId: string) => void;
}

export default function OnlineSetup({ onCreated }: Props) {
  const [count, setCount] = useState(2);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const game = await createGame(count);
      onCreated(game.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the game.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal">
      <h2>Set Up Online Game</h2>
      <div className="setup-row">
        <label className="setup-label" htmlFor="onlineCount">
          Number of Players:
        </label>
        <select id="onlineCount" value={count} onChange={(e) => setCount(Number(e.target.value))}>
          <option value={2}>2 Players</option>
          <option value={3}>3 Players</option>
          <option value={4}>4 Players</option>
        </select>
      </div>
      <p>You'll get a link to share with the others once the game is created.</p>

      {error && <p className="online-error">{error}</p>}
      <button className="action-btn btn-start" onClick={handleCreate} disabled={creating}>
        {creating ? 'Creating…' : 'Create Game'}
      </button>
    </div>
  );
}
