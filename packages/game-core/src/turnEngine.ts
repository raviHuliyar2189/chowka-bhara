import type { PlayerId } from './paths';
import { type Player, canMovePiece, hasAnyLegalMove, hasCaptureChance, movePiece } from './rules';
import { rollDice, type RollResult } from './dice';

export type Phase = 'awaiting-roll' | 'awaiting-selection' | 'game-over';

export interface GameState {
  players: Player[];
  currentTurnIndex: number;
  rollHistory: RollResult[]; // rolls made this turn (bonus chain), for display
  pool: number[]; // consumable move values in roll order
  selectedPoolIndex: number | null;
  rankings: PlayerId[]; // finish order
  phase: Phase;
  message: string;
  eventSeq: number; // increments on every capture, for UI toast triggers
  lastCaptureCount: number;
  lastCapturePlayer: string;
  turnStartSnapshot: Player[]; // players' state at the start of the current player's turn — if
  // the turn later gets stuck partway through the dice pool, we revert to this rather than
  // leaving partial moves (including captures) standing
  debugLog: string[]; // plain-text record of every roll/move/capture/revert/turn-change this
  // game, in order — for reproducing gameplay bugs exactly (copy button lives in the UI)
  lastMoveSnapshot: GameState | null; // state immediately before the most recent piece move, for
  // a single-level "roll back last move" — cleared on every roll, turn change, or forfeit, so it
  // never reaches further back than the one move that was just made
  actionSeq: number; // increments on every roll or piece move — the UI watches this to know the
  // current player just acted, so it can reset the "you've been idle" nudge timer
}

function withLog(state: GameState, line: string): GameState {
  return { ...state, debugLog: [...state.debugLog, line] };
}

function clonePlayers(players: Player[]): Player[] {
  return players.map((p) => ({ ...p, pieces: p.pieces.map((pc) => ({ ...pc })) }));
}

export interface PlayerDef {
  id: PlayerId;
  name: string;
  color: string;
}

export function createGame(playerDefs: PlayerDef[]): GameState {
  const players: Player[] = playerDefs.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    pieces: [1, 2, 3, 4].map((id) => ({ id, pos: 0 })),
    isFinished: false,
    hasLost: false,
    hasCaptured: false,
  }));
  return {
    players,
    currentTurnIndex: 0,
    rollHistory: [],
    pool: [],
    selectedPoolIndex: null,
    rankings: [],
    phase: 'awaiting-roll',
    message: `${players[0].name}, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ`,
    eventSeq: 0,
    lastCaptureCount: 0,
    lastCapturePlayer: '',
    turnStartSnapshot: clonePlayers(players),
    debugLog: [`Game started: ${players.map((p) => `${p.id}=${p.name}`).join(', ')}`],
    lastMoveSnapshot: null,
    actionSeq: 0,
  };
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentTurnIndex];
}

export function roll(state: GameState, rng?: () => number): GameState {
  if (state.phase !== 'awaiting-roll') return state;
  const result = rollDice(rng);
  const rollHistory = [...state.rollHistory, result];
  const pool = [...state.pool, result.value];
  const player = currentPlayer(state);
  const faces = result.faces.map((f) => (f === 0 ? 'B' : 'W')).join('');
  // A fresh roll invalidates rollback of whatever move preceded it — new dice are in play now.
  // actionSeq bumps too: the player just acted, so the UI's idle-nudge timer should reset.
  const rolled = withLog(
    { ...state, lastMoveSnapshot: null, actionSeq: state.actionSeq + 1 },
    `${player.name} rolled ${faces} -> ${result.label}(${result.value})${result.isBonus ? ' [bonus]' : ''}`
  );

  if (result.isBonus) {
    return {
      ...rolled,
      rollHistory,
      pool,
      message: `${player.name} ${result.label} ಎಸೆದರು! ಬೋನಸ್ ಎಸೆತ — ಮತ್ತೆ ಕವಡೆ ಹಾಕಿ.`,
    };
  }

  return autoSelectIfSingle(
    passIfNoLegalMove({
      ...rolled,
      rollHistory,
      pool,
      phase: 'awaiting-selection',
      message: `${player.name}, ನಿಮಗೆ ಈಗ ಬಿದ್ದ ಗರ ${result.label}. ನಿಮ್ಮ ಗರ ನಡೆಸಿ.`,
    })
  );
}

// All the dice a turn produces must be played out. If the player gets stuck partway through
// (some pool value has no legal move left for any piece), the whole turn's moves — including
// any pieces moved and any captures made since the turn started — are undone, as if none of it
// happened, rather than letting partial moves stand. The one exception: a player finishing the
// game (all 4 pieces home) is never reverted just because a leftover die can't be used.
function passIfNoLegalMove(state: GameState): GameState {
  const player = currentPlayer(state);
  if (state.pool.length === 0 || hasAnyLegalMove(player, state.pool)) {
    return state;
  }

  // advanceTurn always sets its own "next player, roll!" (or "Game over!") message — prepend
  // the explanation to that rather than passing it as the initial message, or advanceTurn's
  // message would just overwrite it and the player would never see why their moves vanished.
  if (player.isFinished) {
    const logged = withLog(
      { ...state, pool: [], rollHistory: [] },
      `${player.name} finished; unused pool [${state.pool.join(',')}] discarded.`
    );
    const advanced = advanceTurn(logged);
    return {
      ...advanced,
      message: `${player.name} has no pieces left to move — the remaining dice go unused. ${advanced.message}`,
    };
  }

  const revertedPlayers = clonePlayers(state.turnStartSnapshot);
  const revertedPlayer = revertedPlayers[state.currentTurnIndex];
  const logged = withLog(
    { ...state, players: revertedPlayers, pool: [], rollHistory: [] },
    `${revertedPlayer.name} stuck with pool [${state.pool.join(',')}] — turn undone, reverted to start-of-turn state.`
  );
  const advanced = advanceTurn(logged);
  return {
    ...advanced,
    message: `${revertedPlayer.name} couldn't play out all the dice — this turn's moves are undone. ${advanced.message}`,
  };
}

// With only one value left in the pool, there's no real choice to make — select it for the
// player so they only have to pick a piece.
function autoSelectIfSingle(state: GameState): GameState {
  if (state.phase === 'awaiting-selection' && state.pool.length === 1 && state.selectedPoolIndex === null) {
    return { ...state, selectedPoolIndex: 0 };
  }
  return state;
}

export function selectPoolValue(state: GameState, index: number): GameState {
  if (state.phase !== 'awaiting-selection') return state;
  const player = currentPlayer(state);
  return withLog({ ...state, selectedPoolIndex: index }, `${player.name} picked value ${state.pool[index]} from the pool`);
}

export function selectPiece(state: GameState, pieceId: number): GameState {
  if (state.phase !== 'awaiting-selection' || state.selectedPoolIndex === null) return state;
  const player = currentPlayer(state);
  const piece = player.pieces.find((p) => p.id === pieceId);
  if (!piece) return state;
  const val = state.pool[state.selectedPoolIndex];
  if (!canMovePiece(player, piece, val)) return state;

  // Snapshot the pre-move state for a possible one-level rollback — must deep-clone players
  // since movePiece mutates piece objects in place, and the snapshot carries no history of its
  // own (lastMoveSnapshot: null) so undo never reaches back more than this one move.
  const preMoveSnapshot: GameState = { ...state, players: clonePlayers(state.players), lastMoveSnapshot: null };

  const beforePos = piece.pos;
  const captured = movePiece(state.players, player, piece, val);
  const pool = state.pool.filter((_, i) => i !== state.selectedPoolIndex);

  let logged = withLog(state, `${player.name} piece ${pieceId} uses ${val}: ${beforePos} -> ${piece.pos}`);
  if (captured.length > 0) {
    logged = withLog(
      logged,
      `${player.name} captured ${captured.map((c) => `${c.player.name}#${c.piece.id}`).join(', ')} at pos ${piece.pos}`
    );
  }

  let next: GameState = {
    ...logged,
    pool,
    selectedPoolIndex: null,
    lastMoveSnapshot: preMoveSnapshot,
    // The player just acted — reset the UI's idle-nudge timer.
    actionSeq: state.actionSeq + 1,
    message: captured.length
      ? `${player.name} captured ${captured.length} piece(s)!`
      : `${player.name} moved piece ${pieceId}.`,
  };

  if (player.isFinished && !next.rankings.includes(player.id)) {
    next = {
      ...next,
      rankings: [...next.rankings, player.id],
      message: `${player.name} finished! Place #${next.rankings.length}.`,
    };
  }

  if (captured.length > 0) {
    // Capturing grants a bonus roll on top of the current turn — any other pending pool
    // values (e.g. an unused roll from before the capture) stay available, they don't get
    // wiped out; the new roll's value(s) just join them.
    return {
      ...next,
      phase: 'awaiting-roll',
      message: `${player.name} captured a piece — roll again!`,
      eventSeq: state.eventSeq + 1,
      lastCaptureCount: captured.length,
      lastCapturePlayer: player.name,
    };
  }

  if (pool.length > 0) {
    return autoSelectIfSingle(passIfNoLegalMove({ ...next, phase: 'awaiting-selection' }));
  }

  return advanceTurn(next);
}

// Note: deliberately does NOT clear lastMoveSnapshot — advanceTurn is routinely called as part
// of processing the very move being tracked (e.g. a normal turn only ever has one pool value, so
// consuming it both moves the piece AND ends the turn in the same click). Clearing it here would
// make rollback unavailable for exactly the common case it exists for. It's cleared instead by
// the next roll() (whoever rolls next, same player's bonus chain or the incoming player), by
// rollbackLastMove() itself, or by forfeiting — see each's own comment.
// A player who hasn't captured anyone and now has no remaining chance to ever do so (see
// hasCaptureChance's own comment) would otherwise circle the outer ring forever, unable to reach
// the inner ring and unable to finish — this declares them lost instead of letting the game stall.
function markUncapturedDeadlocks(state: GameState): GameState {
  let next = state;
  for (const p of state.players) {
    if (p.isFinished || p.hasLost || p.hasCaptured) continue;
    if (hasCaptureChance(p, next.players)) continue;
    const players = next.players.map((pp) => (pp.id === p.id ? { ...pp, hasLost: true } : pp));
    next = withLog({ ...next, players }, `${p.name} has no remaining chance to capture — declared lost.`);
  }
  return next;
}

function advanceTurn(state: GameState): GameState {
  const checked = markUncapturedDeadlocks(state);
  const active = checked.players.filter((p) => !p.isFinished && !p.hasLost);
  if (active.length <= 1) {
    const rankings = [...checked.rankings];
    if (active.length === 1 && !rankings.includes(active[0].id)) rankings.push(active[0].id);
    return withLog(
      {
        ...checked,
        rankings,
        phase: 'game-over',
        pool: [],
        rollHistory: [],
        message: 'Game over!',
      },
      `Game over. Rankings: ${rankings.join(', ')}`
    );
  }

  let idx = checked.currentTurnIndex;
  do {
    idx = (idx + 1) % checked.players.length;
  } while (checked.players[idx].isFinished || checked.players[idx].hasLost);

  return withLog(
    {
      ...checked,
      currentTurnIndex: idx,
      pool: [],
      rollHistory: [],
      selectedPoolIndex: null,
      phase: 'awaiting-roll',
      message: `${checked.players[idx].name}, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ`,
      turnStartSnapshot: clonePlayers(checked.players),
    },
    `Turn passes to ${checked.players[idx].name}`
  );
}

// Who actually made the move captured in state.lastMoveSnapshot — NOT necessarily state's own
// current player, since a turn-ending move leaves the snapshot in place (see advanceTurn's own
// comment) while currentTurnIndex has already moved on to the next player. The snapshot's own
// currentTurnIndex still points at whoever was current *when they made that move*, which is the
// mover. Exported so callers needing access control (e.g. the online server only letting the
// actual mover roll back their own move) don't have to re-derive this.
export function moverOfLastMove(state: GameState): Player | null {
  if (!state.lastMoveSnapshot) return null;
  return currentPlayer(state.lastMoveSnapshot);
}

// Undo the single most recent piece move (and only that move), restoring the pool/selection so
// the player can pick a different piece or value — the game-rules equivalent of an "oops" key.
// Only available while `state.lastMoveSnapshot` is set, i.e. since the last move and before any
// further roll, turn change, or forfeit (see the field's own comment for exactly when it clears).
export function rollbackLastMove(state: GameState): GameState {
  if (!state.lastMoveSnapshot) return state;
  const mover = moverOfLastMove(state)!;
  return {
    ...state.lastMoveSnapshot,
    debugLog: [...state.debugLog, `${mover.name}'s last move was rolled back — pending action restored.`],
    lastMoveSnapshot: null,
  };
}

// Abort flow: mark the given players as having forfeited, then continue the game.
export function removePlayers(state: GameState, playerIds: PlayerId[]): GameState {
  const players = state.players.map((p) => (playerIds.includes(p.id) ? { ...p, hasLost: true } : p));
  const withLosses: GameState = withLog(
    { ...state, players, pool: [], rollHistory: [], selectedPoolIndex: null, lastMoveSnapshot: null },
    `Forfeited: ${playerIds.join(', ')}`
  );

  const active = players.filter((p) => !p.isFinished && !p.hasLost);
  if (active.length <= 1) {
    const rankings = [...state.rankings];
    if (active.length === 1 && !rankings.includes(active[0].id)) rankings.push(active[0].id);
    return { ...withLosses, rankings, phase: 'game-over', message: 'Game over!' };
  }

  if (players[state.currentTurnIndex].hasLost) {
    return advanceTurn(withLosses);
  }
  return {
    ...withLosses,
    phase: 'awaiting-roll',
    message: `${players[state.currentTurnIndex].name}, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ`,
    // Re-baseline: the players who just forfeited shouldn't come back if this player's turn
    // later gets stuck and reverts — forfeiture isn't one of "this turn's moves."
    turnStartSnapshot: clonePlayers(players),
  };
}

export function rematch(state: GameState): GameState {
  const players: Player[] = state.players.map((p) => ({
    ...p,
    pieces: [1, 2, 3, 4].map((id) => ({ id, pos: 0 })),
    isFinished: false,
    hasLost: false,
    hasCaptured: false,
  }));
  return {
    players,
    currentTurnIndex: 0,
    rollHistory: [],
    pool: [],
    selectedPoolIndex: null,
    rankings: [],
    phase: 'awaiting-roll',
    message: `${players[0].name}, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ`,
    eventSeq: state.eventSeq,
    lastCaptureCount: 0,
    lastCapturePlayer: '',
    turnStartSnapshot: clonePlayers(players),
    debugLog: [`Rematch started: ${players.map((p) => `${p.id}=${p.name}`).join(', ')}`],
    lastMoveSnapshot: null,
    actionSeq: 0,
  };
}
