create table if not exists public.quick_match_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check (run_key ~ '^[0-9a-f]{64}$'),
  owner_key text not null check (owner_key ~ '^(user|guest):'),
  signed_in boolean not null,
  era text not null check (era in ('current', 'alltime')),
  tactic_a text not null check (tactic_a in ('balanced','perimeter','inside','fast','pressure')),
  tactic_b text not null check (tactic_b in ('balanced','perimeter','inside','fast','pressure')),
  score_a smallint not null check (score_a >= 0),
  score_b smallint not null check (score_b >= 0),
  margin smallint not null,
  created_at timestamptz not null default now()
);

create index if not exists quick_match_runs_owner_created_idx
  on public.quick_match_runs (owner_key, created_at desc);
create index if not exists quick_match_runs_created_idx
  on public.quick_match_runs (created_at desc);
create index if not exists quick_match_runs_guest_created_idx
  on public.quick_match_runs (created_at desc) where signed_in = false;

alter table public.quick_match_runs enable row level security;
revoke all on public.quick_match_runs from public, anon, authenticated;

comment on table public.quick_match_runs is
  'Privacy-minimized, server-owned record of every completed FIVEOUT Quick Match simulation.';

create or replace function public.delete_fiveout_account_data(p_owner text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_owner !~ '^user:[0-9a-f-]{36}$' then raise exception 'Invalid account owner'; end if;
  delete from public.quick_match_runs where owner_key = p_owner;
  delete from public.daily_beat_attempts where owner_key = p_owner;
  delete from public.saved_lineups where owner_key = p_owner;
  delete from public.match_profiles where owner_key = p_owner;
  delete from public.match_results where owner_key = p_owner;
  delete from public.match_challenges where creator_key = p_owner or opponent_key = p_owner;
end;
$$;

revoke all on function public.delete_fiveout_account_data(text) from public, anon, authenticated;
grant execute on function public.delete_fiveout_account_data(text) to service_role;
