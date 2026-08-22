import { useEffect, useState } from 'react';
import { confirmMagicLink, fetchMe, type PlayerInfo } from './api';
import OnlineLogin from './OnlineLogin';
import NeedsProfile from './NeedsProfile';

type View =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'check-email'; email: string }
  | { kind: 'needs-profile'; email: string; pendingToken: string };

// Written on every successful login/registration so a "check your email" tab left open in the
// background notices when the link gets clicked in a different tab (the common case, since mail
// clients usually open links in a new tab) and moves itself forward automatically.
const LOGIN_BROADCAST_KEY = 'chowka-online-login';

interface Props {
  onAuthed: (player: PlayerInfo) => void;
}

// Sits in front of the entire app (both hotseat and online) — nothing renders past this until a
// session exists, whether that's a fresh login/registration or a restored cookie from before.
export default function AuthGate({ onAuthed }: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' });

  function announceLoggedIn(p: PlayerInfo) {
    localStorage.setItem(LOGIN_BROADCAST_KEY, String(Date.now()));
    onAuthed(p);
  }

  useEffect(() => {
    (async () => {
      const path = window.location.pathname;

      if (path === '/auth/confirm') {
        const token = new URLSearchParams(window.location.search).get('token');
        window.history.replaceState({}, '', '/');
        if (token) {
          try {
            const result = await confirmMagicLink(token);
            if (result.status === 'needs-profile' && result.email && result.pendingToken) {
              setView({ kind: 'needs-profile', email: result.email, pendingToken: result.pendingToken });
              return;
            }
            if (result.status === 'logged-in' && result.player) {
              announceLoggedIn(result.player);
              return;
            }
          } catch {
            // Fall through to a normal login prompt — the link was likely invalid/expired.
          }
        }
      }

      const me = await fetchMe();
      if (me) {
        announceLoggedIn(me);
      } else {
        setView({ kind: 'login' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab: if login completes in another tab while this one is still on "check your email",
  // pick that up and move forward here too.
  useEffect(() => {
    if (view.kind !== 'check-email') return;
    function onStorage(e: StorageEvent) {
      if (e.key !== LOGIN_BROADCAST_KEY) return;
      fetchMe().then((me) => {
        if (me) announceLoggedIn(me);
      });
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind]);

  if (view.kind === 'loading') {
    return (
      <div className="setup-inline">
        <div className="modal">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (view.kind === 'login') {
    return (
      <div className="setup-inline">
        <OnlineLogin onSent={(email) => setView({ kind: 'check-email', email })} />
      </div>
    );
  }

  if (view.kind === 'check-email') {
    return (
      <div className="setup-inline">
        <div className="modal">
          <h2>Check your email</h2>
          <p>
            We sent a sign-in link to <strong>{view.email}</strong>. Open it to continue — this
            page will pick it up automatically once you do.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-inline">
      <NeedsProfile email={view.email} pendingToken={view.pendingToken} onDone={announceLoggedIn} />
    </div>
  );
}
