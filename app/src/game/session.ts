// Moved to the shared @chowka/game-core workspace package (packages/game-core/src/session.ts),
// along with the PlayerStats type/EMPTY_STATS constant it defines — a future server needs the
// same placement/stats math. This file is a thin re-export so nothing elsewhere in app/ has to
// change its import path.
export * from '@chowka/game-core/session';
