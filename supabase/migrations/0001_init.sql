-- Fridgely initial schema: households, shared data, per-user AI secrets, RLS.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (household_id, user_id)
);
create index members_user_idx on public.members(user_id);

create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index recipes_household_idx on public.recipes(household_id);

create table public.fridge_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit text not null default 'szt',
  expires_on date,
  source text not null default 'manual' check (source in ('manual', 'barcode', 'photo')),
  created_at timestamptz not null default now()
);
create index fridge_items_household_idx on public.fridge_items(household_id, expires_on);

create table public.meal_plan (
  household_id uuid not null references public.households(id) on delete cascade,
  day date not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  primary key (household_id, day)
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'szt',
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
create index shopping_items_household_idx on public.shopping_items(household_id);

-- Written and read only by the `ai` Edge Function (service role). No client policies.
create table public.user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  anthropic_key_encrypted text not null,
  key_last4 text not null,
  updated_at timestamptz not null default now()
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage(user_id, created_at);

-- RLS
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.recipes enable row level security;
alter table public.fridge_items enable row level security;
alter table public.meal_plan enable row level security;
alter table public.shopping_items enable row level security;
alter table public.user_secrets enable row level security;
alter table public.ai_usage enable row level security;

create policy households_select on public.households
  for select to authenticated using (public.is_member(id));

create policy members_select on public.members
  for select to authenticated using (public.is_member(household_id));

create policy recipes_all on public.recipes
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy fridge_items_all on public.fridge_items
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy meal_plan_all on public.meal_plan
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy shopping_items_all on public.shopping_items
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- user_secrets: deliberately no policies and no grants for client roles.
revoke all on public.user_secrets from anon, authenticated;

-- Membership changes go through RPCs only.
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.households(name) values (p_name) returning id into hid;
  insert into public.members(household_id, user_id) values (hid, (select auth.uid()));
  return hid;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  select id into hid from public.households where invite_code = lower(trim(p_code));
  if hid is null then
    raise exception 'invalid invite code';
  end if;
  insert into public.members(household_id, user_id) values (hid, (select auth.uid()))
  on conflict do nothing;
  return hid;
end;
$$;

-- Only the key's last 4 chars and presence are visible to the client.
create or replace function public.api_key_status()
returns table (has_key boolean, last4 text)
language sql
stable
security definer
set search_path = ''
as $$
  select true, s.key_last4 from public.user_secrets s where s.user_id = (select auth.uid())
  union all
  select false, null
  where not exists (select 1 from public.user_secrets s where s.user_id = (select auth.uid()))
  limit 1;
$$;

revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
revoke execute on function public.api_key_status() from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.api_key_status() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;

-- Realtime for shared data
alter publication supabase_realtime add table
  public.recipes, public.fridge_items, public.meal_plan, public.shopping_items;
