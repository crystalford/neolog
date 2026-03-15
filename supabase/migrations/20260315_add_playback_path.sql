-- Add playback_path column for H.264 transcoded video (browser-compatible)
ALTER TABLE public.video_uploads
  ADD COLUMN IF NOT EXISTS playback_path text;
