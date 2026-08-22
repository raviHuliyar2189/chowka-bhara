create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'lobby', -- 'lobby' | 'in_progress' | 'finished' | 'aborted'
  created_by uuid not null references players(id),
  state jsonb, -- the GameState once actual play starts (Stage 4) — null while in 'lobby'
  created_at timestamptz not null default now()
);

create table if not exists game_seats (
  game_id uuid not null references games(id) on delete cascade,
  seat text not null, -- 'P1' | 'P2' | 'P3' | 'P4'
  player_id uuid not null references players(id),
  status text not null default 'invited', -- 'invited' | 'joined'
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (game_id, seat)
);

create index if not exists game_seats_game_id_idx on game_seats (game_id);
create index if not exists game_seats_player_id_idx on game_seats (player_id);
