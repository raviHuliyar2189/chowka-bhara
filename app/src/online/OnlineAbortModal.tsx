import { useT } from '../i18n/strings';

export type AbortUIState =
  | { kind: 'prompt' }
  | { kind: 'waiting'; waitingOnNames: string[] }
  | { kind: 'forfeit-decision'; declineCount: number }
  | { kind: 'awaiting-decision'; decidedByName: string };

interface Props {
  state: AbortUIState;
  onRespond: (agree: boolean) => void;
  onForfeitDecision: (forfeit: boolean) => void;
}

// Online's own abort flow — still a multi-player vote (unlike hotseat's unconditional Resign,
// see ResignModal.tsx), since separate devices can't share one player's on-the-spot decision the
// way a single shared screen can. Each device only ever sees its own step, driven by the
// abort:pending / abort:forfeit-needed / abort:resolved socket events (see OnlinePlay.tsx).
export default function OnlineAbortModal({ state, onRespond, onForfeitDecision }: Props) {
  const t = useT();
  if (state.kind === 'prompt') {
    return (
      <div className="overlay">
        <div className="modal">
          <h3>{t('onlineAbort.title')}</h3>
          <p>{t('onlineAbort.prompt')}</p>
          <button className="action-btn" onClick={() => onRespond(true)}>
            {t('onlineAbort.agree')}
          </button>
          <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={() => onRespond(false)}>
            {t('onlineAbort.decline')}
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'waiting') {
    return (
      <div className="overlay">
        <div className="modal">
          <h3>{t('onlineAbort.title')}</h3>
          <p>
            {t(
              'onlineAbort.waitingFor',
              state.waitingOnNames.length > 0 ? state.waitingOnNames.join(', ') : t('onlineAbort.otherPlayers')
            )}
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'forfeit-decision') {
    return (
      <div className="overlay">
        <div className="modal">
          <h3>{t('onlineAbort.declinedCount', state.declineCount)}</h3>
          <p>{t('onlineAbort.forfeitQuestion')}</p>
          <button className="action-btn" onClick={() => onForfeitDecision(true)}>
            {t('onlineAbort.yesContinue')}
          </button>
          <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={() => onForfeitDecision(false)}>
            {t('onlineAbort.noResume')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h3>{t('onlineAbort.title')}</h3>
        <p>{t('onlineAbort.decidingBy', state.decidedByName)}</p>
      </div>
    </div>
  );
}
