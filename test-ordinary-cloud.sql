begin;
select set_config('request.jwt.claim.sub',(select p.id::text from public.profiles p join auth.users u on u.id=p.id where p.role='user' and u.email_confirmed_at is not null order by p.created_at limit 1),true);
set local role authenticated;
do $$
declare idea bigint; request uuid:=gen_random_uuid(); direct_result text;
begin
 if auth.uid() is null then raise exception 'No confirmed ordinary user for regression'; end if;
 if public.is_moderator() then raise exception 'Test must use ordinary user'; end if;
 begin
  insert into public.ideas(user_id,title,problem,solution,category,status,request_id) values(auth.uid(),'Тест прямой публикации','Тестовая проблема','Тестовое решение','Инфраструктура','Новое',request);
  direct_result:='Direct insert allowed';
 exception when insufficient_privilege then direct_result:=sqlerrm; end;
 perform set_config('test.direct_result',direct_result,true);
 idea:=public.submit_idea(request,'Проверка обычного участника','Тестовая проблема','Тестовое решение','Инфраструктура');
 if idea is null then raise exception 'RPC returned no idea'; end if;
 if public.submit_idea(request,'Повтор','Тестовая проблема','Тестовое решение','Инфраструктура')<>idea then raise exception 'Duplicate request not idempotent'; end if;
 if not exists(select 1 from public.ideas where id=idea and user_id=auth.uid() and status='Новое') then raise exception 'Ordinary user cannot read submitted idea'; end if;
 perform public.submit_comment(request,idea,'Комментарий обычного участника');
 perform public.set_idea_vote(idea,true);
 perform public.set_idea_vote(idea,false);
end; $$;
select current_setting('test.direct_result') as direct_insert,'PASS: ordinary user RPC publication, read, retry, comment and vote' as rpc_result;
rollback;
