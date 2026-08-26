alter table player_stats add column if not exists resigned integer not null default 0;
alter table player_stats add column if not exists games_1p integer not null default 0;
alter table player_stats add column if not exists games_2p integer not null default 0;
alter table player_stats add column if not exists games_3p integer not null default 0;
alter table player_stats add column if not exists games_4p integer not null default 0;
