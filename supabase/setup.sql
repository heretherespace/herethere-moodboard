-- HERE/THERE Moodboard — run once in Supabase: SQL Editor → New query → paste → Run

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  parent_id uuid references public.sections(id) on delete cascade,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  image_path text,
  link text not null default '',
  caption text not null default '',
  size integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists pins_section_idx on public.pins(section_id);

alter table public.sections enable row level security;
alter table public.pins enable row level security;

drop policy if exists "own sections" on public.sections;
create policy "own sections" on public.sections
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own pins" on public.pins;
create policy "own pins" on public.pins
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Private photo storage: each person can only touch files in their own folder
insert into storage.buckets (id, name, public)
values ('pins', 'pins', false)
on conflict (id) do nothing;

drop policy if exists "own pin files read" on storage.objects;
create policy "own pin files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'pins' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own pin files write" on storage.objects;
create policy "own pin files write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pins' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own pin files delete" on storage.objects;
create policy "own pin files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pins' and (storage.foldername(name))[1] = auth.uid()::text);
