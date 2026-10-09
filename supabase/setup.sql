-- Run this once in Supabase Dashboard → SQL Editor.
create table if not exists public.user_data
(
    user_id
    uuid
    primary
    key
    references
    auth
    .
    users
(
    id
) on delete cascade,
    payload jsonb not null default '{"books": [], "sessions": []}'::jsonb,
    updated_at timestamptz not null default now
(
)
    );

alter table public.user_data enable row level security;
grant select, insert, update, delete on public.user_data to authenticated;
drop
policy if exists "Users manage their own study data" on public.user_data;
create
policy "Users manage their own study data"
  on public.user_data for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('my-pace-photos', 'my-pace-photos', false, 10485760, array['image/jpeg', 'image/png',
        'image/webp']) on conflict (id) do
update set
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

drop
policy if exists "Users manage their own study photos" on storage.objects;
create
policy "Users manage their own study photos"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'my-pace-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'my-pace-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
