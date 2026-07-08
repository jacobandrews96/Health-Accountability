-- ============================================================
-- Health Accountability — one-time database setup.
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Safe to re-run: it never drops tables that hold app data.
-- ============================================================

-- ---- Remove tables from the old prototype app (if present) ----
drop table if exists notes cascade;
drop table if exists habits cascade;
drop table if exists members cascade;
-- The prototype also had a "checkins" table (with a member_id column);
-- the real app has its own. Drop only the prototype version.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'checkins'
               and column_name = 'member_id') then
    drop table public.checkins cascade;
  end if;
end $$;

-- ============================================================
-- Tables
-- ============================================================

-- One row per user, auto-created at signup by the trigger below.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- User-defined metrics. Nothing hardcoded in the app.
create table if not exists metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('number','yesno','duration','count','scale')),
  unit text,
  cadence text not null default 'daily' check (cadence in ('daily','weekly')),
  -- higher: higher is better; lower: lower is better; cap: target is a ceiling
  direction text not null default 'higher' check (direction in ('higher','lower','cap')),
  -- how a week of daily values rolls up against the weekly goal
  agg text not null default 'sum' check (agg in ('sum','avg','count_days','last')),
  sort int not null default 0,
  archived boolean not null default false,
  -- Featured yes/no habits render as one-tap arcade tiles on Home (max 4,
  -- enforced in the app).
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

-- Safe upgrade for databases created before the featured column existed.
alter table metrics add column if not exists featured boolean not null default false;

-- One value per user + metric + day.
create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  metric_id uuid not null references metrics(id) on delete cascade,
  day date not null,
  value numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, metric_id, day)
);

-- One target per user + metric + Monday-start week.
create table if not exists weekly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  metric_id uuid not null references metrics(id) on delete cascade,
  week_start date not null,
  target numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, metric_id, week_start)
);

-- One per user per day: mood + sleep quality (sleep hours logs as a metric).
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  mood int check (mood between 1 and 10),
  mood_note text,
  sleep_quality int check (sleep_quality between 1 and 10),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- Quick log always; `details` holds optional exercises/sets/reps/weight.
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  kind text not null,
  duration_min int,
  note text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Append-only baseline snapshots; the newest row is the current baseline.
create table if not exists baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  weight numeric,
  fixing text not null default '',
  falling_short text not null default '',
  created_at timestamptz not null default now()
);

-- User-defined vices.
create table if not exists vices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- A slip: which vice, when, optional note.
create table if not exists vice_events (
  id uuid primary key default gen_random_uuid(),
  vice_id uuid not null references vices(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

-- Confessions and resisted urges.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('confession','urge')),
  body text not null,
  created_at timestamptz not null default now()
);

-- Emoji and/or short comment on a feed item.
create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('entry','vice_event','workout','checkin')),
  target_id uuid not null,
  emoji text,
  body text,
  created_at timestamptz not null default now(),
  check (emoji is not null or body is not null)
);

-- ============================================================
-- Row Level Security: any signed-in member reads everything,
-- but can only write their own rows. Anonymous gets nothing.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['profiles','metrics','daily_logs','weekly_goals',
                           'checkins','workouts','baselines','vices',
                           'vice_events','entries','reactions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read all" on %I', t);
    execute format(
      'create policy "read all" on %I for select to authenticated using (true)', t);
  end loop;

  -- Write policies for user-owned tables (profiles handled separately).
  foreach t in array array['metrics','daily_logs','weekly_goals','checkins',
                           'workouts','baselines','vices','vice_events',
                           'entries','reactions']
  loop
    execute format('drop policy if exists "insert own" on %I', t);
    execute format('drop policy if exists "update own" on %I', t);
    execute format('drop policy if exists "delete own" on %I', t);
    execute format(
      'create policy "insert own" on %I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format(
      'create policy "update own" on %I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format(
      'create policy "delete own" on %I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- Signup trigger: create the profile and seed starter metrics
-- and vices for every new user. All seeds are ordinary rows —
-- rename, edit, or delete them freely in the app.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''),
             split_part(new.email, '@', 1))
  );

  insert into public.metrics (user_id, name, type, unit, cadence, direction, agg, sort, featured) values
    (new.id, 'Weight',           'number',   'lbs',   'daily', 'lower',  'last', 1, false),
    (new.id, 'Calories',         'number',   'kcal',  'daily', 'cap',    'avg',  2, false),
    (new.id, 'Steps',            'count',    'steps', 'daily', 'higher', 'avg',  3, false),
    (new.id, 'Gym session',      'yesno',    null,    'daily', 'higher', 'sum',  4, true),
    (new.id, 'Meals ordered in', 'count',    'meals', 'daily', 'cap',    'sum',  5, false),
    (new.id, 'Sleep',            'duration', 'hours', 'daily', 'higher', 'avg',  6, false);

  insert into public.vices (user_id, name) values
    (new.id, 'Drinking'),
    (new.id, 'Weed'),
    (new.id, 'Pigging out');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
