-- Seed (черновик). Пользователи создаются вручную в Supabase Dashboard → Authentication → Add user
-- (email + пароль, пароли в репозиторий не кладём): manager@demo.local, worker1@demo.local, worker2@demo.local.
-- Затем запустить этот файл в SQL Editor. Профили связываются по email.
-- Статусы получаются честно: через change_task_status от имени нужного пользователя, поэтому история реалистична.
begin;
insert into public.profiles(id, role, full_name)
select id, r.role::public.user_role, r.full_name
from (values ('manager@demo.local','manager','Иван Постановщиков'),
             ('worker1@demo.local','worker','Пётр Монтажников'),
             ('worker2@demo.local','worker','Олег Отделочников')) r(email, role, full_name)
join auth.users u on u.email = r.email
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

do $$
declare
  m uuid := (select id from auth.users where email='manager@demo.local');
  w1 uuid := (select id from auth.users where email='worker1@demo.local');
  w2 uuid := (select id from auth.users where email='worker2@demo.local');
  o1 uuid; o2 uuid; o3 uuid; t uuid; r record; s text;
begin
  if m is null or w1 is null or w2 is null then raise exception 'create demo users first'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role','authenticated')::text, true);
  insert into public.objects(name,address) values ('ЖК «Северный»','Уфа, ул. Ленина, 10') returning id into o1;
  insert into public.objects(name,address) values ('Склад «Восток»','Уфа, ул. Индустриальная, 5') returning id into o2;
  insert into public.objects(name,address) values ('Коттедж Петровых','Уфимский р-н, д. Зубово') returning id into o3;

  -- helper-цепочки: (задача, исполнитель, путь статусов)
  create temp table _plan(title text, obj uuid, who uuid, path text[]) on commit drop;
  insert into _plan values
   ('Залить фундамент секции А', o1, w1, '{}'),
   ('Смонтировать опалубку', o1, w1, '{in_progress}'),
   ('Армирование перекрытия 2 этажа', o1, w2, '{in_progress,review}'),
   ('Кладка перегородок', o1, w2, '{in_progress,review,accepted}'),
   ('Монтаж ворот', o2, w1, '{in_progress,review,rework}'),
   ('Покраска фасада', o2, w2, '{in_progress,review,rework,in_progress}'),
   ('Устройство кровли', o3, w1, '{in_progress,review,rework,in_progress,review,accepted}'),
   ('Электрика: разводка', o3, w2, '{}');
    for r in select * from _plan loop
      perform set_config('request.jwt.claims', json_build_object('sub', m, 'role','authenticated')::text, true);
      insert into public.tasks(title, description, object_id, assignee_id)
        values (r.title, 'Демо-задача', r.obj, r.who) returning id into t;
      foreach s in array r.path loop
        perform set_config('request.jwt.claims', json_build_object('sub',
          case when s in ('accepted','rework') then m else r.who end, 'role','authenticated')::text, true);
        perform public.change_task_status(t, s::public.task_status,
          case when s = 'rework' then 'Есть замечания, см. фото' end);
      end loop;
    end loop;
end $$;
commit;
