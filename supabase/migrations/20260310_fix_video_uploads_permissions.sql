-- Fix missing Postgres privileges for video uploads and clip sessions
-- This resolves the "permission denied for table video_uploads" error.

GRANT ALL PRIVILEGES ON TABLE public.video_uploads TO anon;
GRANT ALL PRIVILEGES ON TABLE public.video_uploads TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.video_uploads TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.clip_sessions TO anon;
GRANT ALL PRIVILEGES ON TABLE public.clip_sessions TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.clip_sessions TO service_role;
