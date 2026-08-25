import { useT } from '../i18n/strings';

interface Props {
  onChoose: (mode: 'hotseat' | 'online' | 'vs-computer' | 'develop-test') => void;
}

export default function ModeSelect({ onChoose }: Props) {
  const t = useT();
  return (
    <div className="setup-inline">
      <div className="modal">
        <h2>{t('modeSelect.heading')}</h2>
        <div className="mode-select-options">
          <button className="action-btn" onClick={() => onChoose('vs-computer')}>
            {t('modeSelect.singlePlayer')}
          </button>
          <button className="action-btn" onClick={() => onChoose('hotseat')}>
            {t('modeSelect.multiLocal')}
          </button>
          <button className="action-btn" onClick={() => onChoose('online')}>
            {t('modeSelect.multiOnline')}
          </button>
          <button className="action-btn" onClick={() => onChoose('develop-test')}>
            {t('modeSelect.developTest')}
          </button>
        </div>
      </div>
    </div>
  );
}
