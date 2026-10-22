-- Управление модераторами. Не назначает администратора автоматически.
begin;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user','moderator','admin'));
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;
create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('moderator','admin')); $$;
create table if not exists public.role_changes (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.profiles(id),
 target_id uuid not null references public.profiles(id),
 previous_role text not null,
 new_role text not null,
 created_at timestamptz not null default now()
);
alter table public.role_changes enable row level security;
drop policy if exists "admins read role history" on public.role_changes;
create policy "admins read role history" on public.role_changes for select to authenticated using (public.is_admin());
revoke all privileges on public.role_changes from public,anon,authenticated;
revoke all privileges on sequence public.role_changes_id_seq from public,anon,authenticated;
grant select on public.role_changes to authenticated;
create or replace function public.admin_list_users(p_search text default '')
returns table (user_id uuid, name text, email text, role text, created_at timestamptz, confirmed boolean)
language plpgsql security definer set search_path = public
as $$
begin
 if not public.is_admin() then raise exception 'Недостаточно прав.'; end if;
 return query select p.id,p.name,u.email::text,p.role,p.created_at,u.email_confirmed_at is not null
 from public.profiles p join auth.users u on u.id=p.id
 where coalesce(p_search,'')='' or p.name ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%'
 order by p.created_at desc,p.id limit 50;
end; $$;
create or replace function public.admin_set_moderator(p_user_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare old_role text;
begin
 -- Lock the actor so role revocation cannot race this operation.
 perform 1 from public.profiles where id=auth.uid() and role='admin' for update;
 if not found then raise exception 'Недостаточно прав.'; end if;
 if p_enabled is null then raise exception 'Укажи действие.'; end if;
 if p_user_id=auth.uid() then raise exception 'Свою роль изменить нельзя.'; end if;
 select p.role into old_role from public.profiles p where p.id=p_user_id for update;
 if not found then raise exception 'Пользователь не найден.'; end if;
 if old_role='admin' then raise exception 'Роль администратора защищена.'; end if;
 if p_enabled and not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'Сначала пользователь должен подтвердить почту.'; end if;
 if old_role=(case when p_enabled then 'moderator' else 'user' end) then return; end if;
 update public.profiles set role=case when p_enabled then 'moderator' else 'user' end where id=p_user_id;
 insert into public.role_changes(actor_id,target_id,previous_role,new_role) values(auth.uid(),p_user_id,old_role,case when p_enabled then 'moderator' else 'user' end);
end; $$;
revoke execute on function public.is_admin() from public,anon,authenticated;
revoke execute on function public.admin_list_users(text) from public,anon,authenticated;
revoke execute on function public.admin_set_moderator(uuid,boolean) from public,anon,authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_set_moderator(uuid,boolean) to authenticated;
create or replace function public.change_idea_status(p_idea_id bigint, p_new_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_idea public.ideas%rowtype; v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if not public.is_moderator() then raise exception 'Недостаточно прав.'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Укажи объяснение решения.'; end if;
  select * into v_idea from public.ideas where id = p_idea_id for update;
  if not found or v_idea.deleted_at is not null then raise exception 'Идея не найдена.'; end if;
  if v_idea.status = p_new_status then return jsonb_build_object('changed', false, 'status', v_idea.status); end if;
  if not ((v_idea.status = 'Новое' and p_new_status = 'На рассмотрении') or
          (v_idea.status = 'На рассмотрении' and p_new_status in ('Принято','Отклонено')) or
          (v_idea.status = 'Принято' and p_new_status in ('Реализовано','Отклонено'))) then
    raise exception 'Такой переход статуса запрещён.';
  end if;
  update public.ideas set status = p_new_status where id = p_idea_id;
  insert into public.status_history(idea_id, from_status, to_status, reason, moderator_id)
  values (p_idea_id, v_idea.status, p_new_status, trim(p_reason), auth.uid());
  return jsonb_build_object('changed', true, 'status', p_new_status);
end;
$$;


commit;
