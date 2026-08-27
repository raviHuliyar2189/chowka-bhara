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
import { useLanguage } from './i18n/useLanguage';
import { setLanguage } from './i18n/language';
import { useChromeHidden } from './ui/appChrome';
import './App.css';

// Shared header for every screen after the welcome splash (mode-select, login, online setup) —
// just the language toggle now; the app name/version moved to the welcome page itself (the only
// place a title's vertical space isn't competing with the board — see REQUIREMENTS.md's Decisions
// log). Renders nothing at all while a live game screen has hidden it (useChromeHidden), so that
// space goes to the board instead — those screens carry their own compact "App Controls" button
// with the same language toggle, alongside sound/report-bug/voice controls.
function AppHeader() {
  const lang = useLanguage();
  const hidden = useChromeHidden();
  if (hidden) return null;
  return (
    <div className="app-header-bar">
      <span className="lang-toggle">
        <button
          className={`lang-btn${lang === 'en' ? ' active' : ''}`}
          onClick={() => setLanguage('en')}
          disabled={lang === 'en'}
        >
          EN
        </button>
        <button
          className={`lang-btn${lang === 'kn' ? ' active' : ''}`}
          onClick={() => setLanguage('kn')}
          disabled={lang === 'kn'}
        >
          ಕನ್ನಡ
        </button>
      </span>
    </div>
  );
}

// A game-invite link (/games/:id) opened fresh always means "online, right now" — skip the
// dedication splash for that case, since the person just clicked a link that only makes sense in
// that context. The router below matches whatever path is already in the address bar the moment
// it mounts, so no separate redirect-preservation bookkeeping is needed once auth completes.
const isGameInviteLink = typeof window !== 'undefined' && /^\/games\/[^/]+$/.test(window.location.pathname);

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
  return (
    <OnlineGamePage gameId={gameId!} me={me} justCreated={justCreated} onExit={() => navigate('/online')} />
  );
}

export default function App() {
  const [showWelcome, setShowWelcome] = useState(!isGameInviteLink);
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
      <AppHeader />
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
