-- Схема: профили, объекты, задачи, история статусов
create type public.user_role as enum ('manager', 'worker');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       public.user_role not null default 'worker',
  full_name  text not null check (length(btrim(full_name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  address    text not null check (length(btrim(address)) between 1 and 500),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 5000),
  object_id   uuid not null references public.objects(id) on delete restrict,
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  status      public.task_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_object_id_idx   on public.tasks(object_id);
create index tasks_assignee_id_idx on public.tasks(assignee_id, status);
create index tasks_author_id_idx   on public.tasks(author_id);

create table public.task_status_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  from_status public.task_status,               -- null = создание задачи
  to_status   public.task_status not null,
  changed_by  uuid not null references public.profiles(id) on delete restrict,
  comment     text check (comment is null or length(comment) <= 2000),
  changed_at  timestamptz not null default now(),
  check (from_status is distinct from to_status)
);
create index task_status_history_task_idx on public.task_status_history(task_id, changed_at);
