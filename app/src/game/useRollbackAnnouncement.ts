import { useEffect, useRef } from 'react';
import { rolledBackBy, type GameState } from './turnEngine';

// Calls onRolledBack(playerName) exactly once per rollback, by comparing each new GameState to the
// previous one (see rolledBackBy's own comment in turnEngine.ts for why this reads the debug log).
// Shared by all three gameplay pages since Board/DiceTray's roll-back button reaches each through a
// different path (local reducer vs. socket round trip), but the resulting GameState is all any of
// them ever sees — so one detector covers every mode, including the *other* players' devices online.
export function useRollbackAnnouncement(game: GameState | null, onRolledBack: (playerName: string) => void): void {
  const prevRef = useRef<GameState | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = game;
    if (!game || !prev) return;
    const name = rolledBackBy(prev, game);
    if (name) onRolledBack(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);
}
