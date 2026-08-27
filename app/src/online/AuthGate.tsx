import { useEffect, useState } from 'react';
import { fetchMe, type PlayerInfo } from './api';
import OnlineLogin from './OnlineLogin';
import NeedsProfile from './NeedsProfile';
import { useT } from '../i18n/strings';
import { setChromeHidden } from '../ui/appChrome';

type View = { kind: 'loading' } | { kind: 'login' } | { kind: 'needs-profile'; email: string };

interface Props {
  onAuthed: (player: PlayerInfo) => void;
}

// Sits in front of the entire app (both hotseat and online) — nothing renders past this until a
// session exists, whether that's a fresh login/sign-up or a restored cookie from before.
export default function AuthGate({ onAuthed }: Props) {
  const t = useT();
  const [view, setView] = useState<View>({ kind: 'loading' });

  // Hides the global app header's own language toggle (App.tsx's AppHeader) for as long as this
  // screen is up — OnlineLogin shows its own copy instead, right-aligned next to its "Sign In"
  // heading, at the user's explicit request; same reasoning and mechanism as mode-select's own
  // copy of this (see REQUIREMENTS.md's Decisions log).
  useEffect(() => {
    setChromeHidden(true);
    return () => setChromeHidden(false);
  }, []);

  useEffect(() => {
    fetchMe()
      .then((me) => {
        if (me) onAuthed(me);
        else setView({ kind: 'login' });
      })
      // fetchMe() already swallows its own request failures internally, but a synchronous throw
      // upstream of that (e.g. localStorage access blocked by a restrictive in-app browser) would
      // otherwise surface as an unhandled promise rejection that leaves this screen stuck on
      // "Loading…" forever, with no visible error — fall back to the login view instead.
      .catch(() => setView({ kind: 'login' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (view.kind === 'loading') {
    return (
      <div className="setup-inline">
        <div className="modal">
          <p>{t('auth.loading')}</p>
        </div>
      </div>
    );
  }

  if (view.kind === 'login') {
    return (
      <div className="setup-inline">
        <OnlineLogin onLoggedIn={onAuthed} onNoAccount={(email) => setView({ kind: 'needs-profile', email })} />
      </div>
    );
  }

  return (
    <div className="setup-inline">
      <NeedsProfile email={view.email} onDone={onAuthed} />
    </div>
  );
}
