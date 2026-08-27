import { useEffect } from 'react';
import { useT } from '../i18n/strings';
import { setChromeHidden } from '../ui/appChrome';
import LanguageToggle from '../components/LanguageToggle';

interface Props {
  onChoose: (mode: 'hotseat' | 'online' | 'vs-computer' | 'develop-test') => void;
}

export default function ModeSelect({ onChoose }: Props) {
  const t = useT();

  // Hides the global app header's own language toggle (App.tsx's AppHeader) while this screen is
  // mounted — this screen shows its own copy instead, right-aligned next to its heading, at the
  // user's explicit request (moved here instead of the standalone top bar — see REQUIREMENTS.md's
  // Decisions log). Same hide/show mechanism the live gameplay screens already use for the same
  // reason (their own App Controls button carries the toggle instead).
  useEffect(() => {
    setChromeHidden(true);
    return () => setChromeHidden(false);
  }, []);

  return (
    <div className="setup-inline">
      <div className="modal">
        <div className="mode-select-heading-row">
          <h2>{t('modeSelect.heading')}</h2>
          <LanguageToggle />
        </div>
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
