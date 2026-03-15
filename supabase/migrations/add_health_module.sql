-- Health Module Migration
-- Adds physical profile fields to profiles table and creates health_logs table

-- ── Profile: physical fields ──────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS height_cm INTEGER,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS biological_sex TEXT CHECK (biological_sex IN ('male', 'female', 'other', NULL)),
  ADD COLUMN IF NOT EXISTS unit_preference TEXT DEFAULT 'imperial' CHECK (unit_preference IN ('imperial', 'metric'));

-- ── health_logs table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Biometrics
  weight_kg NUMERIC(5,1),

  -- Daily state
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
  sleep_hours NUMERIC(3,1),
  mood TEXT,

  -- Activity
  workout_done BOOLEAN DEFAULT FALSE,
  workout_notes TEXT,

  -- Free text notes
  notes TEXT,

  -- Source tracking
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'video_analysis')),
  source_upload_id UUID REFERENCES public.video_uploads(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_health_logs_user_id ON public.health_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_logged_at ON public.health_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_logs_source ON public.health_logs(user_id, source);

-- RLS
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health logs"
  ON public.health_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health logs"
  ON public.health_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health logs"
  ON public.health_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health logs"
  ON public.health_logs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to health logs"
  ON public.health_logs FOR ALL
  USING (auth.role() = 'service_role');
