-- Private storage bucket for user-uploaded files.
-- Files are stored under a per-user folder: "<user_id>/<filename>".
-- Storage policies ensure a user can only touch objects in their own folder.

insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do nothing;

-- storage.objects already has row-level security enabled by Supabase;
-- we only add per-user policies scoped to this bucket.

create policy "Users read own objects in user-files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'user-files'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users upload own objects in user-files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-files'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users update own objects in user-files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'user-files'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'user-files'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users delete own objects in user-files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-files'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
