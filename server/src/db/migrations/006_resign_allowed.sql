-- Online's in-game consensus Abort flow is replaced by hotseat's unconditional self-Resign
-- (adapted: resigns the requesting player specifically, not "whoever's turn it is," since online
-- has one device per player rather than one shared device) — mirrors hotseat's per-game
-- "Resignation Allowed?" setup toggle, defaulting to not allowed.
alter table games add column if not exists resign_allowed boolean not null default false;
