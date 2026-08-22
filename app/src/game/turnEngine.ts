// Moved to the shared @chowka/game-core workspace package (packages/game-core/src/turnEngine.ts)
// so a future networked-play server can be the authoritative caller of this exact same engine —
// see the architecture notes in the multiplayer plan. This file is a thin re-export so nothing
// elsewhere in app/ has to change its import path.
export * from '@chowka/game-core/turnEngine';
