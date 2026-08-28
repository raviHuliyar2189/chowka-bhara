import { useState } from 'react';
import { useT } from '../i18n/strings';
import { submitBugReport, type BugReportPayload } from '../online/api';

interface Props {
  mode: BugReportPayload['mode'];
  // Only online has a server-side game row to attach this to — every other mode always passes
  // null (see the migration's own comment on bug_reports.game_id).
  gameId: string | null;
  debugLog: string[];
  onClose: () => void;
}

type SubmitStatus = 'idle' | 'sending' | 'sent' | 'failed';

export default function ReportBugModal({ mode, gameId, debugLog, onClose }: Props) {
  const t = useT();
  const [observation, setObservation] = useState('');
  const [expected, setExpected] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [collated, setCollated] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');

  // Collates the same text the player sees below (for their own copy/paste use) and, in parallel,
  // sends it to the backend to be saved for later analysis — at explicit request, so a report
  // survives even if the player never gets around to pasting/sending it anywhere themselves.
  function handleCollate() {
    const text = [
      t('bug.sectionReport'),
      '',
      t('bug.sectionObservation'),
      observation.trim() || t('bug.notProvided'),
      '',
      t('bug.sectionExpected'),
      expected.trim() || t('bug.notProvided'),
      '',
      t('bug.sectionSuggestion'),
      suggestion.trim() || t('bug.notProvided'),
      '',
      t('bug.sectionDebugLog'),
      ...debugLog,
    ].join('\n');
    setCollated(text);

    setSubmitStatus('sending');
    submitBugReport({ mode, gameId, observation: observation.trim(), expected: expected.trim(), suggestion: suggestion.trim(), debugLog })
      .then(() => setSubmitStatus('sent'))
      .catch(() => setSubmitStatus('failed'));
  }

  async function handleCopy() {
    if (!collated) return;
    try {
      await navigator.clipboard.writeText(collated);
      setCopyLabel(t('bug.copied'));
    } catch {
      setCopyLabel(t('bug.copyFailed'));
    }
    setTimeout(() => setCopyLabel(null), 1500);
  }

  return (
    <div className="overlay">
      <div className="modal report-bug-modal">
        <h3>{t('bug.title')}</h3>
        {collated === null ? (
          <>
            <p>{t('bug.observePrompt')}</p>
            <textarea
              className="report-bug-textarea"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder={t('bug.observePlaceholder')}
              rows={3}
              autoFocus
            />
            <p>{t('bug.expectPrompt')}</p>
            <textarea
              className="report-bug-textarea"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder={t('bug.expectPlaceholder')}
              rows={3}
            />
            <p>{t('bug.suggestPrompt')}</p>
            <textarea
              className="report-bug-textarea"
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder={t('bug.suggestPlaceholder')}
              rows={3}
            />
            <div className="report-bug-actions">
              <button className="action-btn" onClick={handleCollate}>
                {t('bug.reportDetails')}
              </button>
              <button className="action-btn btn-abort" onClick={onClose}>
                {t('bug.cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            {submitStatus === 'sending' && <p className="bug-submit-status">{t('bug.submitting')}</p>}
            {submitStatus === 'sent' && <p className="bug-submit-status bug-submit-ok">{t('bug.submitted')}</p>}
            {submitStatus === 'failed' && <p className="bug-submit-status bug-submit-error">{t('bug.submitFailed')}</p>}
            <p>{t('bug.copyPrompt')}</p>
            <textarea className="report-bug-textarea" value={collated} readOnly rows={14} />
            <div className="report-bug-actions">
              <button className="action-btn" onClick={handleCopy}>
                {copyLabel ?? t('bug.copyToClipboard')}
              </button>
              <button className="action-btn btn-abort" onClick={onClose}>
                {t('bug.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
