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
  const { status, feedback, heard, press, release, confirmResign } = voice;

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
        // Pointer events (one stream for mouse, touch and pen) instead of separate mouse + touch
        // handlers. On a phone the old pair fired *both*: touchstart's preventDefault is ignored
        // (React's root touch listeners are passive), so lifting the finger produced an emulated
        // mousedown that started a second, empty recognition right after the real one. Capturing the
        // pointer also keeps the press alive if the finger drifts off the button while speaking.
        // onContextMenu + the user-select/touch-callout CSS stop a long press (which is exactly how
        // this button is used) from opening the browser's Copy / Select all / Web search menu, which
        // cancelled the touch and aborted the recognition mid-phrase.
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Not fatal — capture only keeps the press alive if the finger drifts off the button.
          }
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={status === 'listening'}
        aria-label={t('voiceCmd.pressToTalk')}
        title={t('voiceCmd.pressToTalk')}
      >
        <span className="ptt-icon" aria-hidden="true">
          🎙️
        </span>
      </button>
      {/* A fixed-size slot: the state label, a feedback message, and the resign-confirm button all
          take turns inside it rather than stacking below the mic, so nothing here can ever change
          the height of this column — and with it the settings panel beside it (at explicit request:
          it must not move under any condition). Feedback takes the label's place when present. */}
      <div className="ptt-text-slot">
        <p className={feedback ? 'ptt-feedback' : 'ptt-label'}>{feedback ?? label}</p>
        {status === 'confirm-resign' && (
          <button type="button" className="action-btn btn-abort ptt-confirm-btn" onClick={confirmResign}>
            {t('resign.gameButton')}
          </button>
        )}
      </div>
      {/* Debug readout (requested): what the recognizer heard and what it was matched to, for every
          press, kept until the next press. Always mounted at a fixed height so it can't shift layout. */}
      <p className="ptt-heard">{heard}</p>
    </div>
  );
}
