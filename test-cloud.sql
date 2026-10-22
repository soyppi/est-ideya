-- Replace CONFIRMED_ADMIN_EMAIL with your confirmed admin email. Run entire file.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='CONFIRMED_ADMIN_EMAIL'),true);
set local role authenticated;
do $$
declare idea bigint; repeated bigint; request uuid := gen_random_uuid(); n integer;
begin
 begin
  perform public.submit_idea(gen_random_uuid(),'Проверка категории','Проблема','Решение','Недопустимо');
  raise exception 'FAIL: invalid category accepted';
 exception when check_violation then null; end;
 idea:=public.submit_idea(request,'Транзакционный тест','Проверка без сохранения','Все записи откатываются','Другое');
 repeated:=public.submit_idea(request,'Транзакционный тест','Проверка без сохранения','Все записи откатываются','Другое');
 if idea<>repeated then raise exception 'FAIL: duplicate idea'; end if;
 perform public.set_idea_vote(idea,true);perform public.set_idea_vote(idea,true);
 select count(*) into n from public.votes where idea_id=idea;
 if n<>1 then raise exception 'FAIL: duplicate vote'; end if;
 perform public.submit_comment(request,idea,'Транзакционный комментарий');
 perform public.submit_comment(request,idea,'Транзакционный комментарий');
 select count(*) into n from public.comments where idea_id=idea;
 if n<>1 then raise exception 'FAIL: duplicate comment'; end if;
 begin
  perform public.change_idea_status(idea,'На рассмотрении',' ');
  raise exception 'FAIL: empty reason accepted';
 exception when raise_exception then
  if sqlerrm='FAIL: empty reason accepted' then raise; end if;
 end;
 perform public.change_idea_status(idea,'На рассмотрении','Транзакционная проверка');
 perform public.change_idea_status(idea,'На рассмотрении','Повтор');
 select count(*) into n from public.status_history where idea_id=idea;
 if n<>1 then raise exception 'FAIL: duplicate history'; end if;
 update public.ideas set title='Устаревшая форма' where id=idea;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL: stale edit'; end if;
 perform public.set_idea_vote(idea,false);
 select count(*) into n from public.votes where idea_id=idea;
 if n<>0 then raise exception 'FAIL: unvote'; end if;
 perform public.moderator_delete_idea(idea,'Транзакционный тест');
 perform set_config('test.hidden_idea',idea::text,true);
end; $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ declare n integer; begin
 select count(*) into n from public.ideas where id=current_setting('test.hidden_idea')::bigint;
 if n<>0 then raise exception 'FAIL: hidden idea exposed'; end if;
 select count(*) into n from public.comments where idea_id=current_setting('test.hidden_idea')::bigint;
 if n<>0 then raise exception 'FAIL: hidden comment exposed'; end if;
 select count(*) into n from public.status_history where idea_id=current_setting('test.hidden_idea')::bigint;
 if n<>0 then raise exception 'FAIL: hidden history exposed'; end if;
end; $$;
rollback;
select 'PASS: cloud validation, idempotent ideas/comments/votes, reasons, atomic history, stale edit and hidden direct requests; fixture transaction rolled back' as result;
