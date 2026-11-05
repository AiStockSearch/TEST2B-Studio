-- Тесты вложений (таблица + storage.objects). Всё в транзакции и откатывается.
begin;
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

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','m@t'),('00000000-0000-0000-0000-00000000000b','w1@t'),('00000000-0000-0000-0000-00000000000c','w2@t');
insert into public.profiles(id,role,full_name) values
 ('00000000-0000-0000-0000-00000000000a','manager','M'),('00000000-0000-0000-0000-00000000000b','worker','W1'),('00000000-0000-0000-0000-00000000000c','worker','W2');

-- manager: объект, задачи W1 (new) и W2, фото-ТЗ
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
insert into public.objects(id,name,address) values ('10000000-0000-0000-0000-000000000001','O','A');
insert into public.tasks(id,title,object_id,assignee_id) values
 ('20000000-0000-0000-0000-000000000001','T-w1','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b'),
 ('20000000-0000-0000-0000-000000000002','T-w2','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c');
insert into storage.objects(bucket_id,name) values
 ('task-photos','20000000-0000-0000-0000-000000000002/brief/30000000-0000-0000-0000-000000000001.jpg');
insert into public.task_attachments(task_id,kind,storage_path) values
 ('20000000-0000-0000-0000-000000000002','brief','20000000-0000-0000-0000-000000000002/brief/30000000-0000-0000-0000-000000000001.jpg'),
 ('20000000-0000-0000-0000-000000000001','brief','20000000-0000-0000-0000-000000000001/brief/30000000-0000-0000-0000-000000000009.png');
select tst.expect_rows($$select * from public.task_attachments where uploaded_by='00000000-0000-0000-0000-00000000000a'$$,2,'manager adds brief; uploaded_by = auth.uid()');
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000001','brief','20000000-0000-0000-0000-000000000002/brief/30000000-0000-0000-0000-000000000003.jpg')$$,'path must start with own task_id');
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000001','brief','20000000-0000-0000-0000-000000000001/brief/30000000-0000-0000-0000-000000000004.gif')$$,'only jpg/png/webp');
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path,uploaded_by) values('20000000-0000-0000-0000-000000000001','brief','20000000-0000-0000-0000-000000000001/brief/30000000-0000-0000-0000-000000000005.jpg','00000000-0000-0000-0000-00000000000b')$$,'uploaded_by not writable (column grant)');
-- лимит 5 на задачу и тип
insert into public.task_attachments(task_id,kind,storage_path) select '20000000-0000-0000-0000-000000000001','brief','20000000-0000-0000-0000-000000000001/brief/3000000' || g || '-0000-0000-0000-000000000000.jpg' from generate_series(1,4) g;
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000001','brief','20000000-0000-0000-0000-000000000001/brief/39999999-0000-0000-0000-000000000000.jpg')$$,'6th brief attachment rejected (limit 5)');

-- W1
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);
select tst.expect_rows($$select * from public.task_attachments$$,5,'worker sees attachments only of own tasks');
select tst.expect_rows($$select * from public.task_attachments where task_id='20000000-0000-0000-0000-000000000002'$$,0,'worker does not see чужие attachments');
select tst.expect_rows($$select * from storage.objects where bucket_id='task-photos' and name like '20000000-0000-0000-0000-000000000002/%'$$,0,'worker cannot read чужой file in storage');
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000001','result','20000000-0000-0000-0000-000000000001/result/40000000-0000-0000-0000-000000000001.jpg')$$,'worker cannot add result while task is new');
select tst.expect_error($$insert into storage.objects(bucket_id,name) values('task-photos','20000000-0000-0000-0000-000000000001/result/40000000-0000-0000-0000-000000000001.jpg')$$,'storage: worker cannot upload while task is new');
select public.change_task_status('20000000-0000-0000-0000-000000000001','in_progress');
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000001','brief','20000000-0000-0000-0000-000000000001/brief/40000000-0000-0000-0000-000000000002.jpg')$$,'worker cannot add brief');
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000002','result','20000000-0000-0000-0000-000000000002/result/40000000-0000-0000-0000-000000000003.jpg')$$,'worker cannot attach to чужая task');
select tst.expect_error($$insert into storage.objects(bucket_id,name) values('task-photos','20000000-0000-0000-0000-000000000002/result/40000000-0000-0000-0000-000000000003.jpg')$$,'storage: worker cannot upload to чужая task');
insert into storage.objects(bucket_id,name) values('task-photos','20000000-0000-0000-0000-000000000001/result/40000000-0000-0000-0000-000000000001.jpg');
insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000001','result','20000000-0000-0000-0000-000000000001/result/40000000-0000-0000-0000-000000000001.jpg');
select tst.expect_rows($$select * from public.task_attachments where kind='result'$$,1,'worker adds result photo to own task in progress');
select tst.expect_affected($$delete from public.task_attachments$$,0,'worker cannot delete attachments');
-- удаление файлов из storage проверяется через Storage API в scripts/security-check.ts (прямой DELETE запрещён самим Supabase)
select tst.expect_error($$update public.task_attachments set kind='brief'$$,'attachments are immutable (no UPDATE grant)');
select public.change_task_status('20000000-0000-0000-0000-000000000001','review');
select tst.expect_error($$insert into public.task_attachments(task_id,kind,storage_path) values('20000000-0000-0000-0000-000000000001','result','20000000-0000-0000-0000-000000000001/result/40000000-0000-0000-0000-000000000009.jpg')$$,'worker cannot add result while on review');

-- W2 видит своё ТЗ-фото, не видит фото W1
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}',true);
select tst.expect_rows($$select * from public.task_attachments$$,1,'W2 sees only own task attachment');
select tst.expect_rows($$select * from storage.objects where bucket_id='task-photos'$$,1,'W2 sees only own task file');

-- manager удаляет
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);
select tst.expect_affected($$delete from public.task_attachments where kind='result'$$,1,'manager deletes attachment');
set local role anon;
select tst.expect_error($$select * from public.task_attachments$$,'anon has no access');
reset role;
do $$ begin raise notice 'ALL ATTACHMENT TESTS PASSED'; end $$;
rollback;
select 'ALL ATTACHMENT TESTS PASSED (rolled back)' as result;
