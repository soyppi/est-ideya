-- Apply after supabase_schema.sql on an existing installation.
begin;
alter table public.ideas add column if not exists request_id uuid;
alter table public.comments add column if not exists request_id uuid;
create unique index if not exists ideas_request_unique on public.ideas(user_id,request_id);
create unique index if not exists comments_request_unique on public.comments(user_id,request_id);
alter table public.ideas drop constraint if exists ideas_category_allowed;
alter table public.ideas add constraint ideas_category_allowed check(category in ('Учёба','Инфраструктура','Досуг','Питание','Другое'));
alter table public.ideas drop constraint if exists ideas_text_limits;
alter table public.ideas add constraint ideas_text_limits check(char_length(trim(problem)) between 1 and 4000 and char_length(trim(solution)) between 1 and 4000);
alter table public.profiles drop constraint if exists profiles_name_limits;
alter table public.profiles add constraint profiles_name_limits check(char_length(trim(name)) between 1 and 80);
alter table public.comments drop constraint if exists comments_body_limits;
alter table public.comments add constraint comments_body_limits check(char_length(trim(body)) between 1 and 2000);
alter table public.status_history drop constraint if exists history_reason_limits;
alter table public.status_history add constraint history_reason_limits check(char_length(trim(reason)) between 1 and 2000);
alter table public.ideas drop constraint if exists ideas_reason_limits;
alter table public.ideas add constraint ideas_reason_limits check(deleted_reason is null or char_length(trim(deleted_reason)) between 1 and 2000);
alter table public.comments drop constraint if exists comments_reason_limits;
alter table public.comments add constraint comments_reason_limits check(deleted_reason is null or char_length(trim(deleted_reason)) between 1 and 2000);

-- Idempotent requests: retrying the same operation returns the original record.
create or replace function public.submit_idea(p_request_id uuid,p_title text,p_problem text,p_solution text,p_category text)
returns bigint language plpgsql security definer set search_path=public as $$
declare result bigint;
begin
 if auth.uid() is null then raise exception 'Войди в аккаунт.'; end if;
 if p_request_id is null then raise exception 'Не указан идентификатор запроса.'; end if;
 insert into public.ideas(user_id,title,problem,solution,category,request_id)
 values(auth.uid(),trim(p_title),trim(p_problem),trim(p_solution),p_category,p_request_id)
 on conflict(user_id,request_id) do nothing returning id into result;
 if result is null then select id into result from public.ideas where user_id=auth.uid() and request_id=p_request_id; end if;
 return result;
end; $$;
create or replace function public.submit_comment(p_request_id uuid,p_idea_id bigint,p_body text)
returns bigint language plpgsql security definer set search_path=public as $$
declare result bigint;
begin
 if auth.uid() is null then raise exception 'Войди в аккаунт.'; end if;
 if p_request_id is null then raise exception 'Не указан идентификатор запроса.'; end if;
 perform 1 from public.ideas where id=p_idea_id and deleted_at is null for share;
 if not found then raise exception 'Идея не найдена.'; end if;
 insert into public.comments(user_id,idea_id,body,request_id) values(auth.uid(),p_idea_id,trim(p_body),p_request_id)
 on conflict(user_id,request_id) do nothing returning id into result;
 if result is null then select id into result from public.comments where user_id=auth.uid() and request_id=p_request_id; end if;
 return result;
end; $$;
create or replace function public.set_idea_vote(p_idea_id bigint,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Войди в аккаунт.'; end if;
 if p_enabled is null then raise exception 'Укажи действие.'; end if;
 -- Same user+idea operations serialize; distinct users remain independent.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_idea_id::text,0));
 perform 1 from public.ideas where id=p_idea_id and deleted_at is null for share;
 if not found then raise exception 'Идея не найдена.'; end if;
 if p_enabled then
  insert into public.votes(user_id,idea_id) values(auth.uid(),p_idea_id) on conflict do nothing;
 else delete from public.votes where user_id=auth.uid() and idea_id=p_idea_id;
 end if;
end; $$;
revoke execute on function public.submit_idea(uuid,text,text,text,text),public.submit_comment(uuid,bigint,text),public.set_idea_vote(bigint,boolean) from public,anon,authenticated;
grant execute on function public.submit_idea(uuid,text,text,text,text),public.submit_comment(uuid,bigint,text),public.set_idea_vote(bigint,boolean) to authenticated;
commit;
