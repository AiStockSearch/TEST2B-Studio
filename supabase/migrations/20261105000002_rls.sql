-- Хелперы ролей и RLS
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
$$;

-- объекты, где у текущего пользователя есть задачи (definer: без рекурсии RLS objects<->tasks)
create or replace function public.has_task_in_object(p_object_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks where object_id = p_object_id and assignee_id = auth.uid())
$$;

revoke all on function public.is_manager() from public, anon;
revoke all on function public.has_task_in_object(uuid) from public, anon;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.has_task_in_object(uuid) to authenticated;

-- Привилегии: anon ничего; authenticated — минимум, остальное отсекает RLS
revoke all on public.profiles, public.objects, public.tasks, public.task_status_history from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.objects to authenticated;
grant select, delete on public.tasks to authenticated;
-- статус, автор, даты напрямую не пишутся: только колонки ниже; статус меняет RPC change_task_status
grant insert (id, title, description, object_id, assignee_id) on public.tasks to authenticated;
grant update (title, description, object_id, assignee_id) on public.tasks to authenticated;
grant select on public.task_status_history to authenticated;
revoke all on sequence public.task_status_history_id_seq from anon, authenticated;

alter table public.profiles            enable row level security;
alter table public.objects             enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;
alter table public.profiles            force row level security;
alter table public.objects             force row level security;
alter table public.tasks               force row level security;
alter table public.task_status_history force row level security;
-- FORCE действует и на владельца таблиц; SECURITY DEFINER-функции, которым нужно
-- обходить RLS, работают от роли с BYPASSRLS (postgres в Supabase) — см. ASSUMPTIONS.md

-- profiles: все вошедшие видят профили (имена в карточках); изменять никто из клиентов не может
create policy profiles_select on public.profiles for select to authenticated using (true);

-- objects
create policy objects_select on public.objects for select to authenticated
  using (public.is_manager() or public.has_task_in_object(id));
create policy objects_insert on public.objects for insert to authenticated
  with check (public.is_manager() and created_by = auth.uid());
create policy objects_update on public.objects for update to authenticated
  using (public.is_manager()) with check (public.is_manager());  -- created_by неизменяем: триггер objects_guard
create policy objects_delete on public.objects for delete to authenticated
  using (public.is_manager());

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_manager() or assignee_id = auth.uid());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_manager());
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_manager());

-- history: только чтение; записи пишет триггер
create policy history_select on public.task_status_history for select to authenticated
  using (public.is_manager() or exists (
    select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid()));
