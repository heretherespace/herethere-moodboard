-- Update 2 — lets you drag pins into your own order and style text notes.
-- Run once: Supabase → SQL Editor → New query → paste → Run
alter table public.pins add column if not exists sort double precision;
alter table public.pins add column if not exists style text not null default 'heading';
