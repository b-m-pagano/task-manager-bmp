
-- Enums
create type public.task_status as enum ('pending','in_progress','done','skipped');
create type public.task_priority as enum ('low','medium','high','urgent');

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  icon text default 'circle',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index categories_user_idx on public.categories(user_id);

-- Google connections (read-only Calendar)
create table public.google_connections (
  user_id uuid primary key references auth.users on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  calendar_ids text[] not null default '{primary}',
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Calendar events (cache)
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  google_event_id text not null,
  calendar_id text not null default 'primary',
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, google_event_id)
);
create index calendar_events_user_range_idx on public.calendar_events(user_id, starts_at, ends_at);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  parent_id uuid references public.tasks on delete cascade,
  category_id uuid references public.categories on delete set null,
  title text not null,
  description text,
  estimated_minutes int not null default 30 check (estimated_minutes > 0),
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'pending',
  due_date date,
  scheduled_day date not null default current_date,
  queue_position int not null default 0,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  pinned_at timestamptz,
  tags text[] not null default '{}',
  quick_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_day_idx on public.tasks(user_id, scheduled_day, queue_position);
create index tasks_user_status_idx on public.tasks(user_id, status);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

-- User settings
create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  day_start_minute int not null default 480,
  after_hours_minute int not null default 1080,
  buffer_minutes int not null default 5,
  carry_unfinished boolean not null default true,
  theme text not null default 'system',
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.categories enable row level security;
alter table public.google_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.tasks enable row level security;
alter table public.user_settings enable row level security;

-- Policies (own rows only)
create policy "own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own google connection" on public.google_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own calendar events" on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bootstrap new users: settings + default categories
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
    on conflict do nothing;

  insert into public.categories (user_id, name, color, icon, sort_order) values
    (new.id, 'Pessoal',    '#10b981', 'heart',   0),
    (new.id, 'Trabalho',   '#6366f1', 'briefcase', 1),
    (new.id, 'Estratégia', '#f59e0b', 'compass', 2),
    (new.id, 'Pessoas',    '#ec4899', 'users',   3);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
