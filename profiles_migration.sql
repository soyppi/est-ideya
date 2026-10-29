-- Public animal avatars; existing owner-only profile RLS remains in force.
begin;
alter table public.profiles add column if not exists avatar text not null default 'cat';
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (avatar in ('cat','dog','fox','bear','panda','koala','tiger','lion','rabbit','frog','owl','penguin','unicorn','mouse','wolf','monkey'));
revoke update(avatar) on public.profiles from public,anon,authenticated;
grant update(avatar) on public.profiles to authenticated;
commit;
