import { useEffect, useState } from 'react';
import { useT } from '../i18n/strings';
import { setChromeHidden } from '../ui/appChrome';
import LanguageToggle from '../components/LanguageToggle';
import AccountControls from '../components/AccountControls';

type Mode = 'hotseat' | 'online' | 'vs-computer' | 'develop-test';

interface Props {
  onChoose: (mode: Mode) => void;
}

export default function ModeSelect({ onChoose }: Props) {
  const t = useT();
  // Developer Mode (the old "Develop Test" Board Editor entry) is hidden from ordinary players by
  // default — it's a debugging tool, not a real way to play — and only revealed by a keyboard
  // shortcut (Ctrl+Shift+D), toggled on/off each time it's pressed. Deliberately not persisted: a
  // fresh visit always starts hidden again, same "secret until you know it" spirit as the shortcut
  // itself. Not available on-screen at all for a touch-only device, same as any keyboard shortcut.
  const [devModeVisible, setDevModeVisible] = useState(false);
  // Which option's info panel is currently expanded, if any — at most one at a time, toggled by
  // its own info button (clicking the open one again, or any other option's, closes/switches it).
  const [openInfo, setOpenInfo] = useState<Mode | null>(null);

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

  function toggleInfo(mode: Mode) {
    setOpenInfo((prev) => (prev === mode ? null : mode));
  }

  function renderOption(mode: Mode, labelKey: string, infoKey: string) {
    return (
      <div className="mode-option">
        <div className="mode-option-row">
          <button className="action-btn" onClick={() => onChoose(mode)}>
            {t(labelKey)}
          </button>
          <button
            type="button"
            className="mode-info-btn"
            aria-label={t('modeSelect.infoLabel')}
            aria-expanded={openInfo === mode}
            onClick={() => toggleInfo(mode)}
          >
            ⓘ
          </button>
        </div>
        {openInfo === mode && <p className="mode-option-info">{t(infoKey)}</p>}
      </div>
    );
  }

  return (
    <div className="setup-inline">
      <div className="modal">
        <p className="screen-app-title">{t('app.title')}</p>
        <div className="screen-heading-row">
          <h2>{t('modeSelect.heading')}</h2>
          <LanguageToggle />
        </div>
        <div className="mode-select-options">
          {renderOption('vs-computer', 'modeSelect.singlePlayer', 'modeSelect.info.singlePlayer')}
          {renderOption('hotseat', 'modeSelect.multiLocal', 'modeSelect.info.multiLocal')}
          {renderOption('online', 'modeSelect.multiOnline', 'modeSelect.info.multiOnline')}
          {devModeVisible && renderOption('develop-test', 'modeSelect.developTest', 'modeSelect.info.developTest')}
        </div>
        <AccountControls />
      </div>
    </div>
  );
}
