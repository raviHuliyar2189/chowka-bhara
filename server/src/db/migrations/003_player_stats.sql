create table if not exists player_stats (
  player_id uuid primary key references players(id),
  games integer not null default 0,
  first integer not null default 0,
  second integer not null default 0,
  third integer not null default 0,
  losses integer not null default 0,
  aborted integer not null default 0
);
