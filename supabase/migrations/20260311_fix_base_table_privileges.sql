-- Fix missing Postgres privileges for core tables
-- This resolves "permission denied" errors for authenticated users.

GRANT ALL PRIVILEGES ON TABLE public.log_entries TO anon;
GRANT ALL PRIVILEGES ON TABLE public.log_entries TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.log_entries TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.assets TO anon;
GRANT ALL PRIVILEGES ON TABLE public.assets TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.assets TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.entities TO anon;
GRANT ALL PRIVILEGES ON TABLE public.entities TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.entities TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.entity_mentions TO anon;
GRANT ALL PRIVILEGES ON TABLE public.entity_mentions TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.entity_mentions TO service_role;
