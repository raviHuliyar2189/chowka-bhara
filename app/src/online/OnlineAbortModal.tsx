export type AbortUIState =
  | { kind: 'prompt' }
  | { kind: 'waiting'; waitingOnNames: string[] }
  | { kind: 'forfeit-decision'; declineCount: number }
  | { kind: 'awaiting-decision'; decidedByName: string };

interface Props {
  state: AbortUIState;
  onRespond: (agree: boolean) => void;
  onForfeitDecision: (forfeit: boolean) => void;
}

// Online counterpart to AbortModal.tsx — that one polls every player through a single shared
// modal (fine on one shared device); here each device only ever sees its own step, driven by the
// abort:pending / abort:forfeit-needed / abort:resolved socket events (see OnlinePlay.tsx).
export default function OnlineAbortModal({ state, onRespond, onForfeitDecision }: Props) {
  if (state.kind === 'prompt') {
    return (
      <div className="overlay">
        <div className="modal">
          <h3>Abort Game?</h3>
          <p>A player wants to abort the game. Do you agree?</p>
          <button className="action-btn" onClick={() => onRespond(true)}>
            Agree to abort
          </button>
          <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={() => onRespond(false)}>
            Decline, keep playing
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'waiting') {
    return (
      <div className="overlay">
        <div className="modal">
          <h3>Abort Game?</h3>
          <p>
            Waiting for{' '}
            {state.waitingOnNames.length > 0 ? state.waitingOnNames.join(', ') : 'the other players'} to
            respond…
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'forfeit-decision') {
    return (
      <div className="overlay">
        <div className="modal">
          <h3>{state.declineCount} player(s) declined to abort</h3>
          <p>
            Continue the game by removing the pieces of the player(s) who agreed to abort, and
            treating them as having lost?
          </p>
          <button className="action-btn" onClick={() => onForfeitDecision(true)}>
            Yes, continue without them
          </button>
          <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={() => onForfeitDecision(false)}>
            No, resume the game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h3>Abort Game?</h3>
        <p>{state.decidedByName} is deciding whether to continue without the players who declined…</p>
      </div>
    </div>
  );
}
