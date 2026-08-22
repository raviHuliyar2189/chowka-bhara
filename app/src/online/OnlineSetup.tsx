import { useEffect, useState } from 'react';
import { createGame, fetchPlayers, type PlayerInfo } from './api';

interface Props {
  me: PlayerInfo;
  onCreated: (gameId: string) => void;
}

// Same three valid seat combinations as the hotseat SetupModal (P1/P3 for 2 players, so they
// sit at opposite bases rather than any arbitrary pair) — the server enforces this too.
const SEATS_BY_COUNT: Record<number, string[]> = {
  2: ['P1', 'P3'],
  3: ['P1', 'P2', 'P3'],
  4: ['P1', 'P2', 'P3', 'P4'],
};

const SEAT_LABELS: Record<string, string> = {
  P1: 'P1 (Bottom)',
  P2: 'P2 (Right)',
  P3: 'P3 (Top)',
  P4: 'P4 (Left)',
};

export default function OnlineSetup({ me, onCreated }: Props) {
  const [count, setCount] = useState(2);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({ P1: me.id });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlayers()
      .then(setPlayers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load players.'));
  }, []);

  const seats = SEATS_BY_COUNT[count];
  const takenElsewhere = new Set(Object.values(selections));

  function handleSelect(seat: string, playerId: string) {
    setSelections((prev) => ({ ...prev, [seat]: playerId }));
  }

  async function handleCreate() {
    const seatPayload: Record<string, string> = {};
    for (const seat of seats) {
      if (selections[seat]) seatPayload[seat] = selections[seat];
    }
    if (Object.keys(seatPayload).length !== seats.length) {
      setError('Pick a player for every seat.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const game = await createGame(seatPayload);
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

      {seats.map((seat) =>
        seat === 'P1' ? (
          <div key={seat} className="setup-row">
            <label className="setup-label">{SEAT_LABELS[seat]}:</label>
            <span>{me.displayName} (you)</span>
          </div>
        ) : (
          <div key={seat} className="setup-row">
            <label className="setup-label" htmlFor={`seat-${seat}`}>
              {SEAT_LABELS[seat]}:
            </label>
            <select id={`seat-${seat}`} value={selections[seat] ?? ''} onChange={(e) => handleSelect(seat, e.target.value)}>
              <option value="">Select a player…</option>
              {players
                .filter((p) => p.id !== me.id && (!takenElsewhere.has(p.id) || selections[seat] === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.email})
                  </option>
                ))}
            </select>
          </div>
        )
      )}

      {error && <p className="online-error">{error}</p>}
      <button className="action-btn btn-start" onClick={handleCreate} disabled={creating}>
        {creating ? 'Creating…' : 'Create Game & Send Invites'}
      </button>
    </div>
  );
}
