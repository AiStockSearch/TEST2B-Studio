-- Фото к задачам: приватный bucket + таблица вложений. Правила дублируются в двух местах:
-- storage.objects (сам файл) и public.task_attachments (запись о файле) — обе проверяют одно и то же.
-- Путь файла: <task_id>/<kind>/<uuid>.<ext>, kind = brief (постановщик) | result (исполнитель).

create type public.attachment_kind as enum ('brief', 'result');

create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  kind         public.attachment_kind not null,
  storage_path text not null unique,
  uploaded_by  uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  constraint task_attachments_path_chk
    check (storage_path ~ ('^' || task_id::text || '/' || kind::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'))
);
create index task_attachments_task_idx on public.task_attachments(task_id, kind);

-- Единая проверка «можно ли добавить вложение kind к задаче» (для таблицы и для storage)
create or replace function private.can_attach(p_task_id uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when private.is_manager() then exists (select 1 from public.tasks where id = p_task_id)
    else p_kind = 'result' and exists (
      select 1 from public.tasks
      where id = p_task_id and assignee_id = auth.uid() and status in ('in_progress', 'rework'))
  end
$$;

create or replace function private.can_read_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (private.is_manager() or exists (
    select 1 from public.tasks where id = p_task_id and assignee_id = auth.uid()))
$$;

-- Разбор пути storage без исключений на мусорном вводе
create or replace function private.path_task_id(p_name text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

-- лимит: не больше 5 файлов на задачу и тип (считаем по storage, т.к. файл грузится раньше записи)
create or replace function private.attach_count(p_task_id uuid, p_kind text)
returns int language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects
  where bucket_id = 'task-photos' and name like p_task_id::text || '/' || p_kind || '/%'
$$;

revoke all on function private.can_attach(uuid, text), private.can_read_task(uuid),
  private.path_task_id(text), private.attach_count(uuid, text) from public, anon;
grant execute on function private.can_attach(uuid, text), private.can_read_task(uuid),
  private.path_task_id(text), private.attach_count(uuid, text) to authenticated;

-- Триггер: автор и время ставит БД; лимит 5 записей на задачу и тип
create or replace function public.task_attachments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.uploaded_by := auth.uid();
  new.created_at := now();
  if (select count(*) from public.task_attachments where task_id = new.task_id and kind = new.kind) >= 5 then
    raise exception 'attachment limit reached' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger task_attachments_guard before insert on public.task_attachments
  for each row execute function public.task_attachments_guard();

revoke all on public.task_attachments from anon, authenticated;
grant select, insert (task_id, kind, storage_path), delete on public.task_attachments to authenticated;
alter table public.task_attachments enable row level security;
alter table public.task_attachments force row level security;

create policy attachments_select on public.task_attachments for select to authenticated
  using (private.can_read_task(task_id));
create policy attachments_insert on public.task_attachments for insert to authenticated
  with check (private.can_attach(task_id, kind::text));
create policy attachments_delete on public.task_attachments for delete to authenticated
  using (private.is_manager());
-- UPDATE политики нет: вложения неизменяемы

-- Bucket: приватный, только картинки до 5 МБ (проверяет Storage API)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-photos', 'task-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy task_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'task-photos' and private.can_read_task(private.path_task_id(name)));
create policy task_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-photos'
    and split_part(name, '/', 2) in ('brief', 'result')
    and name ~ '^[0-9a-f-]{36}/(brief|result)/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and private.can_attach(private.path_task_id(name), split_part(name, '/', 2))
    and private.attach_count(private.path_task_id(name), split_part(name, '/', 2)) < 5
  );
create policy task_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-photos' and private.is_manager());
-- UPDATE (перезапись/перемещение) не разрешена никому
