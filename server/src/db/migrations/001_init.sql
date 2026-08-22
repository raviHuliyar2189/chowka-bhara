create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists magic_links (
  token text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists magic_links_email_idx on magic_links (email);
