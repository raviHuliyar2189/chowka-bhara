import { useEffect, useState } from 'react';
import { useT } from '../i18n/strings';
import { setChromeHidden } from '../ui/appChrome';
import LanguageToggle from '../components/LanguageToggle';
import AccountControls from '../components/AccountControls';

interface Props {
  onChoose: (mode: 'hotseat' | 'online' | 'vs-computer' | 'develop-test') => void;
}

export default function ModeSelect({ onChoose }: Props) {
  const t = useT();
  // Developer Mode (the old "Develop Test" Board Editor entry) is hidden from ordinary players by
  // default — it's a debugging tool, not a real way to play — and only revealed by a keyboard
  // shortcut (Ctrl+Shift+D), toggled on/off each time it's pressed. Deliberately not persisted: a
  // fresh visit always starts hidden again, same "secret until you know it" spirit as the shortcut
  // itself. Not available on-screen at all for a touch-only device, same as any keyboard shortcut.
  const [devModeVisible, setDevModeVisible] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDevModeVisible((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
        <div className="screen-heading-row">
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
          {devModeVisible && (
            <button className="action-btn" onClick={() => onChoose('develop-test')}>
              {t('modeSelect.developTest')}
            </button>
          )}
        </div>
        <AccountControls />
      </div>
    </div>
  );
}
