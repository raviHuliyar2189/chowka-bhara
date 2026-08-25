import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import WelcomeScreen from './components/WelcomeScreen';
import ModeSelect from './online/ModeSelect';
import OnlineSetup from './online/OnlineSetup';
import OnlineGamePage from './online/OnlineGamePage';
import AuthGate from './online/AuthGate';
import HotseatPage from './hotseat/HotseatPage';
import VsComputerPage from './vscomputer/VsComputerPage';
import type { PlayerInfo } from './online/api';
import { unlockAudioOnFirstInteraction } from './audio/announcer';
import './App.css';

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
      <OnlineSetup onCreated={(gameId) => navigate(`/games/${gameId}`)} />
    </div>
  );
}

function OnlineGameRoute({ me }: { me: PlayerInfo }) {
  const { gameId } = useParams();
  const navigate = useNavigate();
  return <OnlineGamePage gameId={gameId!} me={me} onExit={() => navigate('/online')} />;
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
        <h1>
          <span className="app-title-main">Chowka Bhara</span>
          <span className="app-version">Version 0.2</span>
        </h1>
        <AuthGate onAuthed={handleAuthed} />
      </div>
    );
  }

  return (
    <div className="app">
      <h1>
        <span className="app-title-main">Chowka Bhara</span>
        <span className="app-version">Version 0.2</span>
      </h1>
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
