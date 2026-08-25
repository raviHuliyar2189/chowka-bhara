interface Props {
  playerName: string;
  onDismiss: () => void;
}

// Purely informational — resigning is unconditional (the resigning player is already out by the
// time this shows), so there's no Agree/Decline vote to collect here, just an acknowledgment.
export default function ResignModal({ playerName, onDismiss }: Props) {
  return (
    <div className="overlay">
      <div className="modal">
        <h3>Resign Information</h3>
        <p>
          {playerName} accepted defeat and resigned. The player pieces will be removed from the
          board. Do you want to continue playing with remaining players
        </p>
        <button className="action-btn" onClick={onDismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
