import { useState } from 'react';
import type { Player } from '../game/rules';
import type { PlayerId } from '../game/paths';

interface Props {
  players: Player[];
  onResolve: (action: 'abort' | 'resume' | 'forfeit', losers?: PlayerId[]) => void;
}

export default function AbortModal({ players, onResolve }: Props) {
  const active = players.filter((p) => !p.isFinished && !p.hasLost);
  const [i, setI] = useState(0);
  const [declines, setDeclines] = useState<PlayerId[]>([]);
  const [askForfeit, setAskForfeit] = useState(false);

  if (askForfeit) {
    // The players being forfeited are the ones who agreed to abort — the complement of the
    // decliners, since it's the decliners who want to keep playing.
    const agreedToAbort = active.filter((p) => !declines.includes(p.id)).map((p) => p.id);
    return (
      <div className="overlay">
        <div className="modal">
          <h3>{declines.length} player(s) declined to abort</h3>
          <p>
            Continue the game by removing the pieces of the player(s) who agreed to abort, and
            treating them as having lost?
          </p>
          <button className="action-btn" onClick={() => onResolve('forfeit', agreedToAbort)}>
            Yes, continue without them
          </button>
          <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={() => onResolve('resume')}>
            No, resume the game
          </button>
        </div>
      </div>
    );
  }

  if (i >= active.length) return null;
  const player = active[i];

  function respond(agree: boolean) {
    const nextDeclines = agree ? declines : [...declines, player.id];
    const isLast = i + 1 >= active.length;
    if (isLast) {
      if (nextDeclines.length === 0) {
        onResolve('abort');
        return;
      }
      if (nextDeclines.length >= 2) {
        setDeclines(nextDeclines);
        setAskForfeit(true);
        return;
      }
      onResolve('resume');
      return;
    }
    setDeclines(nextDeclines);
    setI(i + 1);
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h3>Abort Game?</h3>
        <p>
          {player.name}, do you agree to abort the game? ({i + 1} of {active.length})
        </p>
        <button className="action-btn" onClick={() => respond(true)}>
          Agree to abort
        </button>
        <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={() => respond(false)}>
          Decline, keep playing
        </button>
      </div>
    </div>
  );
}
