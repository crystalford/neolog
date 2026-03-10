-- Create the "videos" bucket for TUS resumable uploads and processed audio
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  false,
  5368709120, -- 5GB limit
  '{video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg,audio/x-m4a,text/plain}'
)
on conflict (id) do nothing;

-- 1. Enable RLS
-- (Buckets have RLS enabled by default in newer Supabase, but we ensure policies exist)

-- 2. Authenticated users can upload to their own folder
create policy "Users can upload to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Authenticated users can view their own folder
create policy "Users can view their own folder"
on storage.objects for select
to authenticated
using (
  bucket_id = 'videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Authenticated users can update/delete their own folder
create policy "Users can update their own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Service role has full access
create policy "Service role has full access"
on storage.objects for all
to service_role
using (bucket_id = 'videos');
