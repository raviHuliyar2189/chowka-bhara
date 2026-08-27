import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n/strings';
import { useLanguage } from '../i18n/useLanguage';
import { setLanguage } from '../i18n/language';

interface Props {
  soundOn: boolean;
  onToggleSound: () => void;
  onReportBug: () => void;
  // Online mode only: extra content appended after the standard rows (voice join/leave/mute,
  // the audio-blocked recovery button, per-peer connection failures) — kept as children rather
  // than a pile of individual props, since only OnlinePlay.tsx ever has any of this to show.
  children?: ReactNode;
}

// The "App Controls" button (§11's layout pass): everything that isn't a Game Control (roll/
// rollback/resign — see DiceTray.tsx) but also isn't part of the board/dice themselves — sound,
// report bug, language, and (online) voice call setup — used to be spread across a wide button
// row under the dice. Consolidated into one small button + popover so the playing screen's fixed
// width goes to the board instead (see REQUIREMENTS.md's Decisions log).
export default function AppControlsMenu({ soundOn, onToggleSound, onReportBug, children }: Props) {
  const t = useT();
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  return (
    <div className="app-controls" ref={rootRef}>
      <button
        type="button"
        className="app-controls-btn"
        onClick={() => setOpen((v) => !v)}
        title={t('appControls.title')}
        aria-expanded={open}
      >
        {t('appControls.button')}
      </button>
      {open && (
        <div className="app-controls-panel">
          <div className="app-controls-row">
            <span className="app-controls-label">{t('appControls.language')}</span>
            <span className="lang-toggle">
              <button
                className={`lang-btn${lang === 'en' ? ' active' : ''}`}
                onClick={() => setLanguage('en')}
                disabled={lang === 'en'}
              >
                EN
              </button>
              <button
                className={`lang-btn${lang === 'kn' ? ' active' : ''}`}
                onClick={() => setLanguage('kn')}
                disabled={lang === 'kn'}
              >
                ಕನ್ನಡ
              </button>
            </span>
          </div>
          <button
            className={`btn-sound in-game-sound ${soundOn ? 'is-on' : 'is-off'}`}
            onClick={onToggleSound}
            title={soundOn ? t('setup.muteTitle') : t('setup.unmuteTitle')}
          >
            {soundOn ? t('game.soundOn') : t('game.muted')}
          </button>
          <button className="btn-debug-log" onClick={onReportBug} title={t('game.reportBugTitle')}>
            {t('game.reportBug')}
          </button>
          {children}
        </div>
      )}
    </div>
  );
}
