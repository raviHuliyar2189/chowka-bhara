import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import WelcomeScreen from './components/WelcomeScreen';
import ModeSelect from './online/ModeSelect';
import OnlineSetup from './online/OnlineSetup';
import OnlineGamePage from './online/OnlineGamePage';
import AuthGate from './online/AuthGate';
import HotseatPage from './hotseat/HotseatPage';
import VsComputerPage from './vscomputer/VsComputerPage';
import type { PlayerInfo } from './online/api';
import { unlockAudioOnFirstInteraction } from './audio/announcer';
import { useChromeHidden } from './ui/appChrome';
import LanguageToggle from './components/LanguageToggle';
import AccountControls from './components/AccountControls';
import './App.css';

// Shared header for every screen after the welcome splash (login, hotseat/vs-computer/online
// setup, the online lobby) — the language toggle, plus Sign Out/Exit once actually signed in
// (showAccount — meaningless, and not shown, on the login screen itself: there's no account yet
// to sign out of). The app name/version moved to the welcome page itself (the only place a
// title's vertical space isn't competing with the board — see REQUIREMENTS.md's Decisions log).
// Renders nothing while a screen has hidden it via useChromeHidden: live gameplay screens (their
// own compact "App Controls" button carries the same toggle and Sign Out/Exit alongside sound/
// report-bug/voice controls) and mode-select (which shows its own copies of both instead of this
// standalone bar).
function AppHeader({ showAccount }: { showAccount?: boolean }) {
  const hidden = useChromeHidden();
  if (hidden) return null;
  return (
    <div className="app-header-bar">
      <LanguageToggle />
      {showAccount && <AccountControls />}
    </div>
  );
}

// The router below matches whatever path is already in the address bar the moment it mounts
// (including a game-invite link, /games/:id), so no redirect-preservation bookkeeping is needed
// once the welcome splash finishes and auth completes — showWelcome just gates what's rendered
// first, never what URL is actually being navigated to.
const MODE_PATHS = {
  hotseat: '/hotseat',
  online: '/online',
  'vs-computer': '/vs-computer',
  'develop-test': '/develop-test',
} as const;

function ModeSelectRoute() {
  const navigate = useNavigate();
  return <ModeSelect onChoose={(m) => navigate(MODE_PATHS[m])} />;
}

function OnlineSetupRoute() {
  const navigate = useNavigate();
  return (
    <div className="setup-inline">
      <OnlineSetup onCreated={(gameId) => navigate(`/games/${gameId}`, { state: { justCreated: true } })} />
    </div>
  );
}

function OnlineGameRoute({ me }: { me: PlayerInfo }) {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Only true for the one navigation right after "Create Game" (react-router's location.state is
  // just JS attached to that specific history entry — reopening this same URL later, a refresh,
  // or a different device never carries it) — the signal the lobby uses to auto-open WhatsApp
  // exactly once, right when there's actually a fresh invite to send.
  const justCreated = Boolean((location.state as { justCreated?: boolean } | null)?.justCreated);
  // Back to mode select (the "Game Option selection screen"), not online setup — matches
  // hotseat/Vs Computer's own "end session"/exit, which already lands there too, and it's where
  // Sign Out/Exit now live now that they're gone from the in-game App Controls panel.
  return (
    <OnlineGamePage gameId={gameId!} me={me} justCreated={justCreated} onExit={() => navigate('/')} />
  );
}

export default function App() {
  // Always shown first now, even for a game-invite link opened fresh from WhatsApp — the earlier
  // "skip it for invite links" behavior was a deliberate choice, reversed at explicit request (see
  // REQUIREMENTS.md's Decisions log).
  const [showWelcome, setShowWelcome] = useState(true);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);

  useEffect(() => {
    unlockAudioOnFirstInteraction();
  }, []);

  function handleAuthed(p: PlayerInfo) {
    setPlayer(p);
  }

  if (showWelcome) {
    return (
      <div className="app">
        <WelcomeScreen onDone={() => setShowWelcome(false)} />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="app">
        <AppHeader />
        <AuthGate onAuthed={handleAuthed} />
      </div>
    );
  }

  return (
    <div className="app">
      <AppHeader showAccount />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ModeSelectRoute />} />
          <Route path="/hotseat" element={<HotseatPage />} />
          <Route path="/develop-test" element={<HotseatPage allowCustomSetup />} />
          <Route path="/vs-computer" element={<VsComputerPage />} />
          <Route path="/online" element={<OnlineSetupRoute />} />
          <Route path="/games/:gameId" element={<OnlineGameRoute me={player} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
