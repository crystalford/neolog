-- Migration to add foreign key from log_entries to video_uploads
-- This is REQUIRED for Supabase (PostgREST) joins to work using the !column_name syntax

-- First, ensure there are no orphaned IDs that would prevent FK creation
-- (Optional, but safe if we want to be strict. For now we just add the FK)

ALTER TABLE public.log_entries
ADD CONSTRAINT fk_log_entries_source_upload
FOREIGN KEY (source_upload_id)
REFERENCES public.video_uploads(id)
ON DELETE SET NULL;

-- Create an index for the foreign key to optimize joins
CREATE INDEX IF NOT EXISTS idx_log_entries_source_upload_id ON public.log_entries(source_upload_id);
