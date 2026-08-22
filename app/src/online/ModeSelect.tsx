interface Props {
  onChoose: (mode: 'hotseat' | 'online') => void;
}

export default function ModeSelect({ onChoose }: Props) {
  return (
    <div className="setup-inline">
      <div className="modal">
        <h2>How do you want to play?</h2>
        <div className="mode-select-options">
          <button className="action-btn" onClick={() => onChoose('hotseat')}>
            📱 Play Locally (Pass the Device)
          </button>
          <button className="action-btn" onClick={() => onChoose('online')}>
            🌐 Play Online
          </button>
        </div>
      </div>
    </div>
  );
}
