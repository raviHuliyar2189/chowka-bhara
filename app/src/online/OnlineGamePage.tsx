import { useState } from 'react';
import type { PlayerInfo } from './api';
import OnlineLobby from './OnlineLobby';
import OnlinePlay from './OnlinePlay';
import type { GameState } from '../game/turnEngine';
import type { PlayerId } from '../game/paths';

interface Props {
  gameId: string;
  me: PlayerInfo;
  // True only for the one navigation right after this player clicked "Create Game" — see
  // App.tsx's OnlineGameRoute for how it's derived. Tells OnlineLobby it's safe (and wanted) to
  // auto-open WhatsApp with the invite, rather than doing that on every visit to this URL.
  justCreated?: boolean;
  onExit: () => void;
}

// The /games/:gameId page — lobby and gameplay for one specific game. Setup (picking a player
// count and creating a game) lives on its own /online route now, so this only ever toggles
// between waiting-room and in-progress states for a game that already exists.
export default function OnlineGamePage({ gameId, me, justCreated, onExit }: Props) {
  const [playing, setPlaying] = useState<{ state: GameState; mySeat: PlayerId; resignAllowed: boolean } | null>(
    null
  );

  if (playing) {
    return (
      <OnlinePlay
        gameId={gameId}
        initialState={playing.state}
        mySeat={playing.mySeat}
        resignAllowed={playing.resignAllowed}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="setup-inline">
      <OnlineLobby
        gameId={gameId}
        me={me}
        justCreated={justCreated}
        onStart={(state, mySeat, resignAllowed) => setPlaying({ state, mySeat, resignAllowed })}
        onExit={onExit}
      />
    </div>
  );
}
