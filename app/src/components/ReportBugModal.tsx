import { useState } from 'react';
import { useT } from '../i18n/strings';

interface Props {
  debugLog: string[];
  onClose: () => void;
}

export default function ReportBugModal({ debugLog, onClose }: Props) {
  const t = useT();
  const [observation, setObservation] = useState('');
  const [expected, setExpected] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [collated, setCollated] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<string | null>(null);

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
