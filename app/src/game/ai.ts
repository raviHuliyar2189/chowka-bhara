// Lives in the shared @chowka/game-core workspace package (packages/game-core/src/ai.ts) so it
// only ever sees the same rules/legality primitives the real game engine uses. This file is a
// thin re-export so nothing elsewhere in app/ has to change its import path.
export * from '@chowka/game-core/ai';
