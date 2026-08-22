import { useState } from 'react';

interface Props {
  debugLog: string[];
  onClose: () => void;
}

export default function ReportBugModal({ debugLog, onClose }: Props) {
  const [observation, setObservation] = useState('');
  const [expected, setExpected] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [collated, setCollated] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<string | null>(null);

  function handleCollate() {
    const text = [
      '## Bug Report',
      '',
      '### Observation',
      observation.trim() || '(not provided)',
      '',
      '### Expected',
      expected.trim() || '(not provided)',
      '',
      '### Suggestion',
      suggestion.trim() || '(not provided)',
      '',
      '### Debug Log',
      ...debugLog,
    ].join('\n');
    setCollated(text);
  }

  async function handleCopy() {
    if (!collated) return;
    try {
      await navigator.clipboard.writeText(collated);
      setCopyLabel('Copied!');
    } catch {
      setCopyLabel('Copy failed');
    }
    setTimeout(() => setCopyLabel(null), 1500);
  }

  return (
    <div className="overlay">
      <div className="modal report-bug-modal">
        <h3>Report a Bug</h3>
        {collated === null ? (
          <>
            <p>What did you observe?</p>
            <textarea
              className="report-bug-textarea"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="e.g. I had two dice values pending and a piece in the outer ring looked disabled even though the cell it was moving to was empty..."
              rows={3}
              autoFocus
            />
            <p>What did you expect instead?</p>
            <textarea
              className="report-bug-textarea"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="e.g. The piece should have been highlighted and clickable since the target cell was empty."
              rows={3}
            />
            <p>Any suggestion (optional)?</p>
            <textarea
              className="report-bug-textarea"
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="e.g. Double-check the friendly-blocking logic for that cell."
              rows={3}
            />
            <div className="report-bug-actions">
              <button className="action-btn" onClick={handleCollate}>
                Report Bug Details
              </button>
              <button className="action-btn btn-abort" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Copy this and paste it to Claude for debugging:</p>
            <textarea className="report-bug-textarea" value={collated} readOnly rows={14} />
            <div className="report-bug-actions">
              <button className="action-btn" onClick={handleCopy}>
                {copyLabel ?? 'Copy to Clipboard'}
              </button>
              <button className="action-btn btn-abort" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
