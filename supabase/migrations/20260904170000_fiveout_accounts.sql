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

create or replace function public.delete_fiveout_account_data(p_owner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner !~ '^user:[0-9a-f-]{36}$' then
    raise exception 'Invalid account owner';
  end if;

  delete from public.saved_lineups where owner_key = p_owner;
  delete from public.match_profiles where owner_key = p_owner;
  delete from public.match_results where owner_key = p_owner;
  delete from public.match_challenges
    where creator_key = p_owner or opponent_key = p_owner;
end;
$$;

revoke all on function public.delete_fiveout_account_data(text) from public, anon, authenticated;
grant execute on function public.delete_fiveout_account_data(text) to service_role;
