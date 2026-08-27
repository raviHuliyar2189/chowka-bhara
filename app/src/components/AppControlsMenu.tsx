import type { ReactNode } from 'react';
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

// The App Controls panel's actual content — everything that isn't a Game Control (roll/rollback/
// resign — see DiceTray.tsx) but also isn't part of the board/dice themselves: sound, report bug,
// language, and (online) voice call setup. A "dumb" content-only component now, not a self-
// contained button+popover: DiceTray owns the App Control button and the open/close state, and
// renders this as an overlay exactly covering the dice throw area (rather than a popover anchored
// to the button) — see .dice-circle-col/.app-controls-overlay in App.css for why, and
// REQUIREMENTS.md's Decisions log for the full reasoning.
export default function AppControlsPanel({ soundOn, onToggleSound, onReportBug, children }: Props) {
  const t = useT();
  const lang = useLanguage();

  return (
    <>
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
    </>
  );
}
