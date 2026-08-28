create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references players(id),
  mode text not null, -- 'hotseat' | 'vs-computer' | 'online' | 'develop-test'
  game_id uuid references games(id), -- null for hotseat/vs-computer/develop-test, which have no server-side game row
  observation text not null default '',
  expected text not null default '',
  suggestion text not null default '',
  debug_log text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_reporter_id_idx on bug_reports (reporter_id);
create index if not exists bug_reports_created_at_idx on bug_reports (created_at);
