-- Health Accountability — one-time database setup.
-- Paste this whole file into the Supabase SQL Editor and click "Run".

-- People using the app (you and your friend).
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text not null default '💪',
  created_at timestamptz not null default now()
);

-- The shared list of daily habits everyone checks off.
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon text not null default '✅',
  sort int not null default 0,
  active boolean not null default true
);

-- One row per person, per habit, per day it was completed.
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (member_id, habit_id, day)
);

-- Optional daily note per person ("How did today go?").
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  day date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (member_id, day)
);

-- Row Level Security: the app uses the public "publishable" key, so anyone
-- with the app's URL can read and write. That's the intended model for this
-- small private-between-friends app — just don't post the URL publicly.
alter table members enable row level security;
alter table habits enable row level security;
alter table checkins enable row level security;
alter table notes enable row level security;

drop policy if exists "open access" on members;
drop policy if exists "open access" on habits;
drop policy if exists "open access" on checkins;
drop policy if exists "open access" on notes;

create policy "open access" on members for all using (true) with check (true);
create policy "open access" on habits for all using (true) with check (true);
create policy "open access" on checkins for all using (true) with check (true);
create policy "open access" on notes for all using (true) with check (true);

-- Starter habits (edit these in the Table Editor any time — the app
-- picks up changes automatically).
insert into habits (label, icon, sort)
select * from (values
  ('Workout', '🏋️', 1),
  ('Eat healthy', '🥗', 2),
  ('Sleep 7+ hours', '😴', 3),
  ('Drink enough water', '💧', 4),
  ('Get outside / steps', '👟', 5)
) as seed(label, icon, sort)
where not exists (select 1 from habits);
