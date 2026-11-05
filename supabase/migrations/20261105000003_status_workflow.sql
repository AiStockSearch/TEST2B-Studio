-- Бизнес-правила задач: создание, переходы статусов, история

-- Объекты: автор = текущий пользователь, неизменяем
create or replace function public.objects_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  elsif new.created_by is distinct from old.created_by or new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'objects: created_by/id/created_at are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger objects_guard before insert or update on public.objects
  for each row execute function public.objects_guard();

-- Таблица разрешённых переходов (одно место правды)
create or replace function public.task_transition_actor(p_from public.task_status, p_to public.task_status)
returns text language sql immutable set search_path = public as $$
  select case
    when p_from = 'new'         and p_to = 'in_progress' then 'assignee'
    when p_from = 'in_progress' and p_to = 'review'      then 'assignee'
    when p_from = 'review'      and p_to = 'accepted'    then 'manager'
    when p_from = 'review'      and p_to = 'rework'      then 'manager'
    when p_from = 'rework'      and p_to = 'in_progress' then 'assignee'
    else null end
$$;

create or replace function public.tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_manager boolean := public.is_manager();
  v_actor text;
  v_comment text := nullif(btrim(coalesce(current_setting('app.status_comment', true), '')), '');
begin
  -- исполнитель обязан быть работником
  if not exists (select 1 from public.profiles where id = new.assignee_id and role = 'worker') then
    raise exception 'assignee must be a worker' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if v_uid is null or not v_is_manager then
      raise exception 'only manager can create tasks' using errcode = '42501';
    end if;
    new.status := 'new';            -- создание только в статусе «Новая»
    new.author_id := v_uid;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.id <> old.id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'id/author_id/created_at are immutable' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    -- смена статуса: ничего кроме статуса в том же UPDATE
    if (new.title, new.description, new.object_id, new.assignee_id)
       is distinct from (old.title, old.description, old.object_id, old.assignee_id) then
      raise exception 'status change must not modify other fields' using errcode = '42501';
    end if;
    v_actor := public.task_transition_actor(old.status, new.status);
    if v_actor is null then
      raise exception 'transition % -> % is not allowed', old.status, new.status using errcode = '42501';
    end if;
    if v_actor = 'assignee' and (v_uid is null or v_uid <> old.assignee_id) then
      raise exception 'only the assignee can move task % -> %', old.status, new.status using errcode = '42501';
    end if;
    if v_actor = 'manager' and not v_is_manager then
      raise exception 'only manager can move task % -> %', old.status, new.status using errcode = '42501';
    end if;
    if new.status = 'rework' and v_comment is null then
      raise exception 'comment is required for rework' using errcode = '23514';
    end if;
  else
    -- правка полей: только постановщик
    if not v_is_manager then
      raise exception 'only manager can edit task fields' using errcode = '42501';
    end if;
    if old.status = 'accepted' then
      raise exception 'accepted task is read-only' using errcode = '42501';
    end if;
    if new.assignee_id is distinct from old.assignee_id and old.status = 'review' then
      raise exception 'cannot reassign task under review' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- История: пишет только этот триггер (definer, клиенты прав на INSERT не имеют)
create or replace function public.tasks_log_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_status_history(task_id, from_status, to_status, changed_by, comment, changed_at)
    values (new.id, null, new.status, coalesce(auth.uid(), new.author_id), null, now());
  elsif new.status is distinct from old.status then
    insert into public.task_status_history(task_id, from_status, to_status, changed_by, comment, changed_at)
    values (new.id, old.status, new.status, auth.uid(),
            nullif(btrim(coalesce(current_setting('app.status_comment', true), '')), ''), now());
  end if;
  return null;
end $$;
create trigger tasks_log_status after insert or update of status on public.tasks
  for each row execute function public.tasks_log_status();

-- Единственный путь смены статуса для клиента (колонка status не выдана в GRANT UPDATE)
create or replace function public.change_task_status(
  p_task_id uuid, p_new_status public.task_status, p_comment text default null)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare v_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  -- чужая задача для исполнителя неотличима от несуществующей
  if not found or not (public.is_manager() or v_task.assignee_id = auth.uid()) then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  perform set_config('app.status_comment', coalesce(p_comment, ''), true);
  update public.tasks set status = p_new_status where id = p_task_id returning * into v_task;
  perform set_config('app.status_comment', '', true);
  return v_task;
end $$;

revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
revoke all on function public.tasks_guard() from public, anon, authenticated;
revoke all on function public.tasks_log_status() from public, anon, authenticated;
revoke all on function public.objects_guard() from public, anon, authenticated;
