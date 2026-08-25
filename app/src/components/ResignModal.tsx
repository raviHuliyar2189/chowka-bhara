import { useT } from '../i18n/strings';

interface Props {
  playerName: string;
  onDismiss: () => void;
}

// Purely informational — resigning is unconditional (the resigning player is already out by the
// time this shows), so there's no Agree/Decline vote to collect here, just an acknowledgment.
export default function ResignModal({ playerName, onDismiss }: Props) {
  const t = useT();
  return (
    <div className="overlay">
      <div className="modal">
        <h3>{t('resign.title')}</h3>
        <p>{t('resign.message', playerName)}</p>
        <button className="action-btn" onClick={onDismiss}>
          {t('resign.continue')}
        </button>
      </div>
    </div>
  );
}
