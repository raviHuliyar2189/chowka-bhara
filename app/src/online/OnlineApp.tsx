import { useEffect, useState } from 'react';
import { confirmMagicLink, fetchMe, type PlayerInfo } from './api';
import OnlineLogin from './OnlineLogin';
import NeedsProfile from './NeedsProfile';
import OnlineSetup from './OnlineSetup';
import OnlineLobby from './OnlineLobby';
import OnlinePlay from './OnlinePlay';
import type { GameState } from '../game/turnEngine';
import type { PlayerId } from '../game/paths';

type View =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'check-email'; email: string }
  | { kind: 'needs-profile'; email: string; pendingToken: string }
  | { kind: 'setup' }
  | { kind: 'lobby'; gameId: string }
  | { kind: 'playing'; gameId: string; state: GameState; mySeat: PlayerId };

// If a game-invite link (/games/:id) is opened while logged out, the sign-in detour would
// otherwise lose track of which game they were headed to — this remembers it across that detour.
const REDIRECT_KEY = 'chowka-online-redirect';
// Written on every successful login/registration so a "check your email" tab left open in the
// background notices when the link gets clicked in a different tab (the common case, since mail
// clients usually open links in a new tab) and moves itself forward automatically.
const LOGIN_BROADCAST_KEY = 'chowka-online-login';

function gameIdFromPath(path: string): string | null {
  const match = path.match(/^\/games\/([^/]+)$/);
  return match ? match[1] : null;
}

export default function OnlineApp() {
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [view, setView] = useState<View>({ kind: 'loading' });

  function announceLoggedIn(p: PlayerInfo) {
    setPlayer(p);
    localStorage.setItem(LOGIN_BROADCAST_KEY, String(Date.now()));
    const redirect = sessionStorage.getItem(REDIRECT_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    setView(redirect ? { kind: 'lobby', gameId: redirect } : { kind: 'setup' });
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

      const gameId = gameIdFromPath(path);
      const me = await fetchMe();
      if (me) {
        setPlayer(me);
        setView(gameId ? { kind: 'lobby', gameId } : { kind: 'setup' });
      } else {
        if (gameId) sessionStorage.setItem(REDIRECT_KEY, gameId);
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

  if (view.kind === 'needs-profile') {
    return (
      <div className="setup-inline">
        <NeedsProfile email={view.email} pendingToken={view.pendingToken} onDone={announceLoggedIn} />
      </div>
    );
  }

  if (!player) {
    // Shouldn't happen (setup/lobby/started all imply a logged-in player), but keeps TS happy
    // and fails safe back to the login screen if it somehow does.
    return (
      <div className="setup-inline">
        <OnlineLogin onSent={(email) => setView({ kind: 'check-email', email })} />
      </div>
    );
  }

  if (view.kind === 'setup') {
    return (
      <div className="setup-inline">
        <OnlineSetup me={player} onCreated={(gameId) => setView({ kind: 'lobby', gameId })} />
      </div>
    );
  }

  if (view.kind === 'lobby') {
    return (
      <div className="setup-inline">
        <OnlineLobby
          gameId={view.gameId}
          me={player}
          onStart={(state, mySeat) => setView({ kind: 'playing', gameId: view.gameId, state, mySeat })}
        />
      </div>
    );
  }

  return <OnlinePlay gameId={view.gameId} initialState={view.state} mySeat={view.mySeat} />;
}
