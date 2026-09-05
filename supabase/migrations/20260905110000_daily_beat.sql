create table if not exists public.daily_beat_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null check (owner_key ~ '^(user|guest):'),
  day date not null,
  attempt_number smallint not null check (attempt_number between 1 and 3),
  player_ids integer[] not null check (cardinality(player_ids) = 8),
  tactic text not null check (tactic in ('balanced','perimeter','inside','fast','pressure')),
  score_for smallint not null check (score_for >= 0),
  score_against smallint not null check (score_against >= 0),
  won boolean not null,
  margin smallint not null,
  created_at timestamptz not null default now(),
  unique (owner_key, day, attempt_number)
);

create index if not exists daily_beat_owner_day_idx on public.daily_beat_attempts (owner_key, day desc);
create index if not exists daily_beat_day_idx on public.daily_beat_attempts (day, won);
alter table public.daily_beat_attempts enable row level security;
revoke all on public.daily_beat_attempts from public, anon, authenticated;

comment on table public.daily_beat_attempts is 'Server-owned FIVEOUT Beat This Team daily challenge attempts.';

create or replace function public.delete_fiveout_account_data(p_owner text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_owner !~ '^user:[0-9a-f-]{36}$' then raise exception 'Invalid account owner'; end if;
  delete from public.daily_beat_attempts where owner_key = p_owner;
  delete from public.saved_lineups where owner_key = p_owner;
  delete from public.match_profiles where owner_key = p_owner;
  delete from public.match_results where owner_key = p_owner;
  delete from public.match_challenges where creator_key = p_owner or opponent_key = p_owner;
end;
$$;
revoke all on function public.delete_fiveout_account_data(text) from public, anon, authenticated;
grant execute on function public.delete_fiveout_account_data(text) to service_role;

create or replace function public.transfer_fiveout_daily_attempts(p_guest text, p_owner text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_guest !~ '^guest:[0-9a-f-]{36}$' or p_owner !~ '^user:[0-9a-f-]{36}$' then raise exception 'Invalid owners'; end if;
  delete from public.daily_beat_attempts guest
    where guest.owner_key = p_guest
      and exists (select 1 from public.daily_beat_attempts account where account.owner_key = p_owner and account.day = guest.day);
  update public.daily_beat_attempts set owner_key = p_owner where owner_key = p_guest;
end;
$$;
revoke all on function public.transfer_fiveout_daily_attempts(text,text) from public, anon, authenticated;
grant execute on function public.transfer_fiveout_daily_attempts(text,text) to service_role;
