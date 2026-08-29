import type { ReactNode } from 'react';
import { useT } from '../i18n/strings';
import { useLanguage } from '../i18n/useLanguage';
import { setLanguage } from '../i18n/language';

interface Props {
  soundOn: boolean;
  onToggleSound: () => void;
  onReportBug: () => void;
  // Voice *commands* (push-to-talk gameplay input — app/src/voice/), not to be confused with
  // online's own voice *chat* (the WebRTC join/leave/mute controls in `children` below).
  // voiceCommandsAvailable is a runtime browser-capability check (SpeechRecognition support) —
  // when false the toggle isn't rendered at all, same reasoning as a genuinely absent feature
  // rather than a disabled one (see useVoiceCommands.ts's own capability-check comment).
  voiceCommandsAvailable: boolean;
  voiceOn: boolean;
  onToggleVoice: () => void;
  // Online mode only: extra content appended after the standard rows (voice join/leave/mute,
  // the audio-blocked recovery button, per-peer connection failures) — kept as children rather
  // than a pile of individual props, since only OnlinePlay.tsx ever has any of this to show.
  children?: ReactNode;
}

// Everything that isn't a Game Control (roll/rollback/resign — see DiceTray.tsx) but also isn't
// part of the board/dice themselves: sound, report bug, language, and (online) voice call setup.
// Renders directly in the play area, right below the dice/Game Controls row — used to be tucked
// behind a separate "App Control" trigger button and overlay; removed at explicit request in
// favor of these controls always being visible instead of needing an extra tap to reach. See
// REQUIREMENTS.md's Decisions log for the fuller history.
export default function AppControlsPanel({
  soundOn,
  onToggleSound,
  onReportBug,
  voiceCommandsAvailable,
  voiceOn,
  onToggleVoice,
  children,
}: Props) {
  const t = useT();
  const lang = useLanguage();

  return (
    <div className="app-controls-section">
      {/* Language, Sound, and Report Bug share one row — at explicit request, to use the
         section's full width instead of each taking its own stacked line. */}
      <div className="app-controls-main-row">
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
        {voiceCommandsAvailable && (
          <button
            className={`btn-sound ${voiceOn ? 'is-on' : 'is-off'}`}
            onClick={onToggleVoice}
            title={voiceOn ? t('voiceCmd.toggleOnTitle') : t('voiceCmd.toggleOffTitle')}
          >
            {voiceOn ? t('voiceCmd.on') : t('voiceCmd.off')}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
