-- Тесты RLS и переходов. Запуск: в транзакции, всё откатывается в конце.
-- Имитация пользователя: set local role authenticated + request.jwt.claims (как делает PostgREST / наш серверный Prisma-слой).
begin;
-- Облако: временно очищаем seed внутри транзакции (всё вернёт rollback), т.к. ожидания рассчитаны на пустую базу
delete from public.tasks; delete from public.objects;
create schema tst;
create function tst.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then raise notice 'PASS (error as expected): % -> %', p_label, sqlerrm; return; end;
  raise exception 'FAIL: expected error: %', p_label;
end $$;
create function tst.expect_rows(p_sql text, p_expected int, p_label text) returns void language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  if n <> p_expected then raise exception 'FAIL: % (got %, expected %)', p_label, n, p_expected; end if;
  raise notice 'PASS: % (% rows)', p_label, n;
end $$;
create function tst.expect_affected(p_sql text, p_expected int, p_label text) returns void language plpgsql as $$
declare n int;
begin
  execute p_sql; get diagnostics n = row_count;
  if n <> p_expected then raise exception 'FAIL: % (affected %, expected %)', p_label, n, p_expected; end if;
  raise notice 'PASS: % (affected %)', p_label, n;
end $$;
grant usage on schema tst to authenticated, anon;
grant execute on all functions in schema tst to authenticated, anon;

-- Фикстуры (как service/postgres)
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','m@t'),('00000000-0000-0000-0000-00000000000b','w1@t'),('00000000-0000-0000-0000-00000000000c','w2@t');
insert into public.profiles(id,role,full_name) values
 ('00000000-0000-0000-0000-00000000000a','manager','M'),('00000000-0000-0000-0000-00000000000b','worker','W1'),('00000000-0000-0000-0000-00000000000c','worker','W2');

-- ===== Постановщик =====
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
insert into public.objects(id,name,address) values
 ('10000000-0000-0000-0000-000000000001','Obj1','Addr1'),('10000000-0000-0000-0000-000000000002','Obj2','Addr2');
insert into public.tasks(id,title,object_id,assignee_id) values
 ('20000000-0000-0000-0000-000000000001','T-w1','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b'),
 ('20000000-0000-0000-0000-000000000002','T-w2','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c');
select tst.expect_rows($$select * from public.tasks where status='new' and author_id='00000000-0000-0000-0000-00000000000a'$$,2,'manager creates tasks: status=new, author=auth.uid()');
select tst.expect_rows($$select * from public.task_status_history where from_status is null and to_status='new'$$,2,'creation logged in history');
select tst.expect_error($$insert into public.tasks(title,object_id,assignee_id,status) values('x','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','accepted')$$,'client cannot set status on insert (no column grant)');
select tst.expect_error($$insert into public.tasks(title,object_id,assignee_id) values('x','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a')$$,'assignee must be worker');
select tst.expect_error($$update public.tasks set status='accepted' where id='20000000-0000-0000-0000-000000000001'$$,'direct UPDATE status forbidden (column grant)');
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000001','in_progress')$$,'manager cannot do new->in_progress for worker');
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000001','accepted')$$,'manager cannot skip new->accepted');
select tst.expect_error($$update public.profiles set role='worker' where id='00000000-0000-0000-0000-00000000000a'$$,'profiles UPDATE forbidden');

-- ===== Исполнитель 1 =====
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);
select tst.expect_rows($$select * from public.tasks$$,1,'worker sees only own tasks');
select tst.expect_rows($$select * from public.tasks where id='20000000-0000-0000-0000-000000000002'$$,0,'worker cannot read чужую task by id');
select tst.expect_rows($$select * from public.objects$$,1,'worker sees only objects with own tasks');
select tst.expect_rows($$select * from public.task_status_history$$,1,'worker sees history only of own tasks');
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000002','in_progress')$$,'worker cannot change чужую task via RPC');
select tst.expect_error($$insert into public.tasks(title,object_id,assignee_id) values('x','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b')$$,'worker cannot INSERT task');
select tst.expect_error($$insert into public.objects(name,address) values('x','y')$$,'worker cannot INSERT object');
select tst.expect_affected($$delete from public.tasks where id='20000000-0000-0000-0000-000000000001'$$,0,'worker cannot DELETE task (0 rows)');
select tst.expect_affected($$delete from public.objects$$,0,'worker cannot DELETE objects (0 rows)');
select tst.expect_affected($$update public.tasks set title='hacked' where id='20000000-0000-0000-0000-000000000001'$$,0,'worker cannot change title (0 rows)');
select tst.expect_affected($$update public.tasks set assignee_id='00000000-0000-0000-0000-00000000000c' where id='20000000-0000-0000-0000-000000000001'$$,0,'worker cannot change assignee (0 rows)');
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000001','review')$$,'forbidden new->review');
select public.change_task_status('20000000-0000-0000-0000-000000000001','in_progress');
select public.change_task_status('20000000-0000-0000-0000-000000000001','review');
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000001','accepted')$$,'worker cannot accept');
-- история: никаких записей от клиента
select tst.expect_error($$insert into public.task_status_history(task_id,to_status,changed_by) values('20000000-0000-0000-0000-000000000001','accepted','00000000-0000-0000-0000-00000000000b')$$,'worker history INSERT forbidden');
select tst.expect_error($$update public.task_status_history set comment='x'$$,'worker history UPDATE forbidden');
select tst.expect_error($$delete from public.task_status_history$$,'worker history DELETE forbidden');

-- ===== Постановщик: проверка =====
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000001','rework')$$,'rework without comment fails');
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000001','rework','   ')$$,'rework with blank comment fails');
select tst.expect_error($$update public.tasks set assignee_id='00000000-0000-0000-0000-00000000000c' where id='20000000-0000-0000-0000-000000000001'$$,'no reassign in review');
select public.change_task_status('20000000-0000-0000-0000-000000000001','rework','Переделать откосы');
select tst.expect_rows($$select * from public.task_status_history where to_status='rework' and comment='Переделать откосы' and changed_by='00000000-0000-0000-0000-00000000000a'$$,1,'rework logged with comment and author');
select tst.expect_error($$insert into public.task_status_history(task_id,to_status,changed_by) values('20000000-0000-0000-0000-000000000001','accepted','00000000-0000-0000-0000-00000000000a')$$,'manager history INSERT forbidden');
select tst.expect_error($$delete from public.task_status_history$$,'manager history DELETE forbidden');
select tst.expect_error($$select public.change_task_status('20000000-0000-0000-0000-000000000001','accepted')$$,'rework->accepted forbidden');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);
select public.change_task_status('20000000-0000-0000-0000-000000000001','in_progress');
select public.change_task_status('20000000-0000-0000-0000-000000000001','review');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
select public.change_task_status('20000000-0000-0000-0000-000000000001','accepted');
select tst.expect_error($$update public.tasks set title='x' where id='20000000-0000-0000-0000-000000000001'$$,'accepted task read-only');
select tst.expect_rows($$select * from public.task_status_history where task_id='20000000-0000-0000-0000-000000000001'$$,7,'full history chain (7 records)');
select tst.expect_affected($$update public.tasks set title='T-w2 renamed' where id='20000000-0000-0000-0000-000000000002'$$,1,'manager edits task');
select tst.expect_affected($$delete from public.tasks where id='20000000-0000-0000-0000-000000000002'$$,1,'manager deletes task');
select tst.expect_affected($$delete from public.objects where id='10000000-0000-0000-0000-000000000002'$$,1,'manager deletes empty object');
select tst.expect_error($$delete from public.objects where id='10000000-0000-0000-0000-000000000001'$$,'object with tasks cannot be deleted (restrict)');

-- ===== Prisma-подобный серверный запрос: транзакция + SET LOCAL ROLE + claims с чужим sub =====
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
insert into public.tasks(id,title,object_id,assignee_id) values('20000000-0000-0000-0000-000000000003','T-w2-b','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c');
reset role;
-- так выглядит запрос Prisma $transaction([$executeRaw`SET LOCAL ROLE authenticated`, $executeRaw`select set_config(...)`, findMany])
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);
select tst.expect_rows($$select "id","title" from "public"."tasks" where "assignee_id" = '00000000-0000-0000-0000-00000000000c'$$,0,'Prisma-like query with W1 sub cannot see W2 tasks');
select tst.expect_rows($$select "id" from "public"."tasks" where "id" = '20000000-0000-0000-0000-000000000003'$$,0,'Prisma-like findUnique of чужой task returns null');
-- anon вообще ничего не видит
set local role anon;
select tst.expect_error($$select * from public.tasks$$,'anon has no access to tasks');
reset role;
do $$ begin raise notice 'ALL TESTS PASSED'; end $$;
rollback;
select 'ALL TESTS PASSED (rolled back)' as result;
