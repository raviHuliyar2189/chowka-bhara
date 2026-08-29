import type { VoiceCommandsState } from '../voice/useVoiceCommands';
import { useT } from '../i18n/strings';

interface Props {
  voice: VoiceCommandsState;
}

// A primary gameplay control (roll/select/gatti/resign by voice), not a settings toggle — kept
// visually and structurally distinct from AppControlsPanel's own Voice on/off switch. Rendered
// only when the page has already confirmed voice.supported is true (see each page's own usage).
export default function PushToTalkButton({ voice }: Props) {
  const t = useT();
  const { status, feedback, press, release, confirmResign } = voice;

  const label =
    status === 'listening'
      ? t('voiceCmd.listening')
      : status === 'confirm-resign'
        ? t('voiceCmd.confirmResignPrompt')
        : t('voiceCmd.pressToTalk');

  return (
    <div className="ptt-wrap">
      <button
        type="button"
        className={`ptt-button ptt-${status}`}
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={release}
        onTouchStart={(e) => {
          e.preventDefault();
          press();
        }}
        onTouchEnd={release}
        onTouchCancel={release}
        aria-pressed={status === 'listening'}
        aria-label={t('voiceCmd.pressToTalk')}
        title={t('voiceCmd.pressToTalk')}
      >
        <span className="ptt-icon" aria-hidden="true">
          🎙️
        </span>
      </button>
      <p className="ptt-label">{label}</p>
      {status === 'confirm-resign' && (
        <button type="button" className="action-btn btn-abort ptt-confirm-btn" onClick={confirmResign}>
          {t('resign.gameButton')}
        </button>
      )}
      {feedback && <p className="ptt-feedback">{feedback}</p>}
    </div>
  );
}
