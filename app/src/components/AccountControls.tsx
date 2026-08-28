import { useState } from 'react';
import { useT } from '../i18n/strings';
import { clearToken } from '../online/api';

interface Props {
  // Off for the online lobby's choice (Join/Decline) and waiting-room screens (see
  // REQUIREMENTS.md's Decisions log) — Sign Out there only clears this device's own session, it
  // doesn't release the seat a joined player is actually holding, so it doesn't map to "leaving"
  // the way it looks like it should. Exit stays available everywhere.
  showSignOut?: boolean;
}

// Sign Out / Exit — shared markup so every place they appear (the app header on login/setup/
// lobby screens, mode-select, and the in-game App Controls panel — see REQUIREMENTS.md's
// Decisions log) looks and behaves identically, rather than each screen growing its own copy.
export default function AccountControls({ showSignOut = true }: Props) {
  const t = useT();
  // Set once Exit is clicked, regardless of whether window.close() actually did anything — see
  // handleExit's own comment for why a visible fallback always has to be here.
  const [exitAttempted, setExitAttempted] = useState(false);

  // Clearing the token and reloading forces AuthGate's fetchMe() to re-run from scratch on a
  // clean slate, the same natural "signed out" landing a stale/deleted token already produces
  // elsewhere (see requireAuth's own comment in the server).
  function handleSignOut() {
    clearToken();
    window.location.reload();
  }

  // A web page can't force-close its own tab in the general case — window.close() only actually
  // works when script (this app) opened the window/tab in the first place, which is true for
  // essentially none of this app's real visitors (they typed a URL, tapped a bookmark, or opened
  // an invite link). Still worth trying — it's a real no-op if blocked, and does work in a few
  // genuine cases (a PWA's own last tab in some browsers) — but always paired with a plain,
  // visible note for when it silently doesn't, rather than a button that looks broken.
  function handleExit() {
    window.close();
    setExitAttempted(true);
  }

  return (
    <div className="account-controls">
      <div className="account-controls-row">
        {showSignOut && (
          <button className="account-btn" onClick={handleSignOut} title={t('account.signOutTitle')}>
            {t('account.signOut')}
          </button>
        )}
        <button className="account-btn" onClick={handleExit} title={t('account.exitTitle')}>
          {t('account.exit')}
        </button>
      </div>
      {exitAttempted && <p className="account-exit-note">{t('account.exitNote')}</p>}
    </div>
  );
}
