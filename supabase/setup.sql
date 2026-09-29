-- Worn Again: database, photo storage and "only she can post" rules.
-- Paste this whole file into Supabase → SQL Editor → New query, change the email on the
-- marked line, and press Run. Safe to run again.

-- 1. Who is allowed to post. Put her email here (add more rows for more owners).
create table if not exists public.owners (
  email text primary key
);
alter table public.owners enable row level security;   -- no policies: nobody can read or edit this from the site

insert into public.owners (email) values
  ('HER_EMAIL@example.com')                              -- <-- change this
on conflict do nothing;

-- True when the logged-in person's email is in owners.
create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.owners
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

-- 2. Outfits
create table if not exists public.outfits (
  id         text primary key,
  title      text not null,
  date       date,
  tag        text not null default 'pink',
  vibes      text[] not null default '{}',
  pieces     jsonb not null default '[]',
  notes      text not null default '',
  photos     text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.outfits enable row level security;

drop policy if exists "Anyone can view outfits" on public.outfits;
create policy "Anyone can view outfits" on public.outfits
  for select using (true);

drop policy if exists "Owner can add outfits" on public.outfits;
create policy "Owner can add outfits" on public.outfits
  for insert to authenticated with check ((select public.is_owner()));

drop policy if exists "Owner can edit outfits" on public.outfits;
create policy "Owner can edit outfits" on public.outfits
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "Owner can delete outfits" on public.outfits;
create policy "Owner can delete outfits" on public.outfits
  for delete to authenticated using ((select public.is_owner()));

-- 3. Site settings (one row: name, tagline, Instagram handle)
create table if not exists public.settings (
  id      int primary key default 1 check (id = 1),
  name    text not null default 'Worn Again',
  tagline text not null default 'A running archive of thrifted finds and how I wear them.',
  handle  text not null default ''
);
alter table public.settings enable row level security;
insert into public.settings (id) values (1) on conflict do nothing;

drop policy if exists "Anyone can view settings" on public.settings;
create policy "Anyone can view settings" on public.settings
  for select using (true);

drop policy if exists "Owner can edit settings" on public.settings;
create policy "Owner can edit settings" on public.settings
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- 4. Photo storage: public to view, only the owner can upload or delete. 10 MB per photo cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner can see photo files" on storage.objects;
create policy "Owner can see photo files" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and (select public.is_owner()));

drop policy if exists "Owner can upload photos" on storage.objects;
create policy "Owner can upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and (select public.is_owner()));

drop policy if exists "Owner can replace photos" on storage.objects;
create policy "Owner can replace photos" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and (select public.is_owner()));

drop policy if exists "Owner can delete photos" on storage.objects;
create policy "Owner can delete photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and (select public.is_owner()));
