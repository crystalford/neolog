-- Add recorded_at column to video_uploads to track original recording time
alter table public.video_uploads add column if not exists recorded_at timestamptz;

-- Update existing records to have recorded_at = created_at as a fallback
update public.video_uploads set recorded_at = created_at where recorded_at is null;

-- Add index for chronological ordering by real recording time
create index if not exists idx_video_uploads_recorded_at on public.video_uploads(user_id, recorded_at desc);
