import { useEffect, useState } from 'react';
import type { PlayerInfo } from './api';
import OnlineSetup from './OnlineSetup';
import OnlineLobby from './OnlineLobby';
import OnlinePlay from './OnlinePlay';
import type { GameState } from '../game/turnEngine';
import type { PlayerId } from '../game/paths';

type View =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'lobby'; gameId: string }
  | { kind: 'playing'; gameId: string; state: GameState; mySeat: PlayerId };

function gameIdFromPath(path: string): string | null {
  const match = path.match(/^\/games\/([^/]+)$/);
  return match ? match[1] : null;
}

interface Props {
  me: PlayerInfo;
}

// Auth already happened in AuthGate before this ever mounts — this component only ever deals
// with an authenticated player setting up, waiting in, or playing a game.
export default function OnlineApp({ me }: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    const gameId = gameIdFromPath(window.location.pathname);
    setView(gameId ? { kind: 'lobby', gameId } : { kind: 'setup' });
  }, []);

  if (view.kind === 'loading') {
    return (
      <div className="setup-inline">
        <div className="modal">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (view.kind === 'setup') {
    return (
      <div className="setup-inline">
        <OnlineSetup onCreated={(gameId) => setView({ kind: 'lobby', gameId })} />
      </div>
    );
  }

  if (view.kind === 'lobby') {
    return (
      <div className="setup-inline">
        <OnlineLobby
          gameId={view.gameId}
          me={me}
          onStart={(state, mySeat) => setView({ kind: 'playing', gameId: view.gameId, state, mySeat })}
        />
      </div>
    );
  }

  return (
    <OnlinePlay
      gameId={view.gameId}
      initialState={view.state}
      mySeat={view.mySeat}
      onAborted={() => setView({ kind: 'setup' })}
    />
  );
}
