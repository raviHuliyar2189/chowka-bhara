import { useState } from 'react';
import type { PlayerInfo } from './api';
import OnlineLobby from './OnlineLobby';
import OnlinePlay from './OnlinePlay';
import type { GameState } from '../game/turnEngine';
import type { PlayerId } from '../game/paths';

interface Props {
  gameId: string;
  me: PlayerInfo;
  onExit: () => void;
}

// The /games/:gameId page — lobby and gameplay for one specific game. Setup (picking a player
// count and creating a game) lives on its own /online route now, so this only ever toggles
// between waiting-room and in-progress states for a game that already exists.
export default function OnlineGamePage({ gameId, me, onExit }: Props) {
  const [playing, setPlaying] = useState<{ state: GameState; mySeat: PlayerId } | null>(null);

  if (playing) {
    return (
      <OnlinePlay
        gameId={gameId}
        initialState={playing.state}
        mySeat={playing.mySeat}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="setup-inline">
      <OnlineLobby gameId={gameId} me={me} onStart={(state, mySeat) => setPlaying({ state, mySeat })} />
    </div>
  );
}
