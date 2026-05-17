
-- ============================================================
-- PARTE 2 (idempotente)
-- ============================================================

-- 1) PROJECTS ------------------------------------------------
do $$ begin
  create type public.project_status as enum ('active', 'archived', 'done');
exception when duplicate_object then null; end $$;

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text not null,
  description  text,
  color        text not null default '#6366f1',
  icon         text default 'folder',
  status       public.project_status not null default 'active',
  due_date     date,
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.projects enable row level security;

do $$ begin
  create policy "own projects"
    on public.projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger projects_set_updated_at
    before update on public.projects
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

create index if not exists projects_user_status_idx
  on public.projects (user_id, status, sort_order);

-- 2) TASKS — novas colunas ----------------------------------
alter table public.tasks
  add column if not exists project_id              uuid references public.projects(id) on delete set null,
  add column if not exists completed_at            timestamptz,
  add column if not exists notes                   text,
  add column if not exists actual_duration_minutes integer,
  add column if not exists recurrence_rule         text;

create index if not exists tasks_user_day_queue_idx
  on public.tasks (user_id, scheduled_day, queue_position);

create index if not exists tasks_user_status_day_idx
  on public.tasks (user_id, status, scheduled_day);

create index if not exists tasks_user_project_idx
  on public.tasks (user_id, project_id)
  where project_id is not null;

create index if not exists tasks_user_parent_idx
  on public.tasks (user_id, parent_id)
  where parent_id is not null;

create index if not exists tasks_user_due_idx
  on public.tasks (user_id, due_date)
  where due_date is not null;

create index if not exists tasks_tags_gin_idx
  on public.tasks using gin (tags);

do $$ begin
  create trigger tasks_set_updated_at
    before update on public.tasks
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- 3) CALENDAR_EVENTS — novas colunas ------------------------
alter table public.calendar_events
  add column if not exists source      text not null default 'google',
  add column if not exists is_blocking boolean not null default true;

create index if not exists calendar_events_user_range_idx
  on public.calendar_events (user_id, starts_at, ends_at);

-- 4) CATEGORIES — índice de listagem ------------------------
create index if not exists categories_user_sort_idx
  on public.categories (user_id, sort_order);
