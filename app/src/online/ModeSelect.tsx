interface Props {
  onChoose: (mode: 'hotseat' | 'online' | 'vs-computer' | 'develop-test') => void;
}

export default function ModeSelect({ onChoose }: Props) {
  return (
    <div className="setup-inline">
      <div className="modal">
        <h2>How do you want to play?</h2>
        <div className="mode-select-options">
          <button className="action-btn" onClick={() => onChoose('vs-computer')}>
            🤖 Single player
          </button>
          <button className="action-btn" onClick={() => onChoose('hotseat')}>
            📱 Multiple players (Local)
          </button>
          <button className="action-btn" onClick={() => onChoose('online')}>
            🌐 Multiple Players (Online)
          </button>
          <button className="action-btn" onClick={() => onChoose('develop-test')}>
            🛠️ Develop Test
          </button>
        </div>
      </div>
    </div>
  );
}
