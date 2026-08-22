// Moved to the shared @chowka/game-core workspace package (packages/game-core/src/dice.ts) so
// a future networked-play server can use the exact same dice logic. This file is a thin
// re-export so nothing elsewhere in app/ has to change its import path.
export * from '@chowka/game-core/dice';
