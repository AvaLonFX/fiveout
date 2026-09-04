-- FIVEOUT account layer. Tables remain server-owned; the service role is used
-- only by same-origin route handlers that verify the Supabase session first.

create table if not exists public.match_profiles (
  owner_key text primary key check (owner_key ~ '^user:'),
  public_slug text not null unique default replace(gen_random_uuid()::text, '-', ''),
  display_name text not null default 'FIVEOUT Coach' check (char_length(display_name) between 2 and 32),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.match_profiles alter column is_public set default false;
alter table public.match_profiles enable row level security;
revoke all on public.match_profiles from public, anon, authenticated;

create table if not exists public.saved_lineups (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null check (owner_key ~ '^user:'),
  name text not null check (char_length(name) between 1 and 48),
  era text not null check (era in ('current', 'alltime')),
  player_ids integer[] not null check (cardinality(player_ids) between 5 and 8),
  setup jsonb not null check (jsonb_typeof(setup) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists saved_lineups_owner_created_idx
  on public.saved_lineups (owner_key, created_at desc);

alter table public.saved_lineups enable row level security;
revoke all on public.saved_lineups from public, anon, authenticated;

comment on table public.saved_lineups is
  'Server-owned FIVEOUT rotations. Access is exposed only through route handlers after Supabase session verification.';
