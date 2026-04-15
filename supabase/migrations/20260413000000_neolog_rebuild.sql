-- =============================================
-- NEOLOG REBUILD — New production pipeline tables
-- 2026-04-13
-- Preserves all existing tables and data.
-- =============================================

-- Style cards — visual identity per production
CREATE TABLE IF NOT EXISTS public.style_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  register TEXT NOT NULL, -- dark_atmospheric | observational_doc | abstract | mixed
  palette TEXT NOT NULL,  -- user's colour anchor sentence
  lighting TEXT NOT NULL,
  film_stock TEXT NOT NULL,
  lens TEXT NOT NULL,
  mood TEXT NOT NULL,
  anti_patterns TEXT[] NOT NULL DEFAULT '{}',
  mixed_registers JSONB,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idea cards — surfaced from debrief, one per potential piece of content
CREATE TABLE IF NOT EXISTS public.idea_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT, -- references video_uploads.session_id (string, not FK to allow flexibility)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_timestamps TEXT[],
  themes TEXT[],
  key_quotes TEXT[],
  content_type TEXT NOT NULL,    -- essay | story | thread | short
  audience_appeal TEXT NOT NULL, -- HIGH | MED | LOW
  emotional_tone TEXT,
  uniqueness_note TEXT,
  user_selected BOOLEAN DEFAULT FALSE,
  user_notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Marinating ideas — not ready yet, accumulate across sessions
CREATE TABLE IF NOT EXISTS public.marinating_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea TEXT NOT NULL,
  signal TEXT,
  first_seen_session_id TEXT,
  last_seen_session_id TEXT,
  mention_count INTEGER DEFAULT 1,
  promoted BOOLEAN DEFAULT FALSE,
  promoted_to_idea_card_id UUID REFERENCES public.idea_cards(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debrief messages — streaming conversation history
CREATE TABLE IF NOT EXISTS public.debrief_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL, -- matches video_uploads.session_id
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,        -- user | assistant
  content TEXT NOT NULL,
  phase TEXT DEFAULT 'idea', -- idea | style | handoff
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scripts — versioned, with full segment JSON
CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_card_id UUID REFERENCES public.idea_cards(id),
  session_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  script_json JSONB NOT NULL, -- full segment array
  script_mode TEXT NOT NULL,  -- essay | story
  style_card_id UUID REFERENCES public.style_cards(id),
  total_duration_seconds INTEGER,
  version INTEGER DEFAULT 1,
  parent_script_id UUID REFERENCES public.scripts(id),
  status TEXT DEFAULT 'draft', -- draft | approved | producing | done
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Productions — one per video output
CREATE TABLE IF NOT EXISTS public.productions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id),
  session_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id TEXT,
  status TEXT DEFAULT 'queued', -- queued | running | done | error
  target_platforms TEXT[],
  target_aspect_ratios TEXT[],
  style_card_id UUID REFERENCES public.style_cards(id),
  voiceover_r2_key TEXT,
  music_r2_key TEXT,
  final_video_r2_keys JSONB, -- {youtube: key, tiktok: key, ...}
  thumbnail_r2_key TEXT,
  error_message TEXT,
  cost_cents INTEGER DEFAULT 0,
  cost_breakdown JSONB,
  estimated_cost_cents INTEGER DEFAULT 0,
  user_approved_cost BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Segment assets — per-segment generated assets
CREATE TABLE IF NOT EXISTS public.segment_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL,
  segment_order INTEGER NOT NULL,
  segment_type TEXT,
  narration TEXT,
  flux_prompt TEXT,
  runway_prompt TEXT,
  negative_prompt TEXT,
  keyframe_strategy TEXT, -- single_frame | first_last_frame
  image_r2_key TEXT,
  image_end_r2_key TEXT,
  video_r2_key TEXT,
  voiceover_r2_key TEXT,
  planned_duration_seconds REAL,
  actual_duration_seconds REAL,
  cut_type TEXT,
  narration_visual_relationship TEXT,
  music_cue TEXT,
  music_detail TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post candidates — surfaced from extraction for social publishing
CREATE TABLE IF NOT EXISTS public.post_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  production_id UUID REFERENCES public.productions(id),
  source_type TEXT NOT NULL, -- quote | strong_opinion | observation | clip | announcement | achievement
  raw_content TEXT NOT NULL,
  source_timestamp TEXT,
  generated_versions JSONB NOT NULL DEFAULT '[]', -- [{format_name, text}]
  status TEXT DEFAULT 'ready', -- ready | scheduled | published | discarded
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled posts
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_candidate_id UUID NOT NULL REFERENCES public.post_candidates(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_version_text TEXT NOT NULL,
  platform TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  platform_post_id TEXT,
  status TEXT DEFAULT 'scheduled', -- scheduled | published | failed | cancelled
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post format templates — user-customizable
CREATE TABLE IF NOT EXISTS public.post_format_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = system default
  name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed system-level format templates (once)
INSERT INTO public.post_format_templates (id, user_id, name, instruction, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'Direct',        'Keep verbatim with minimal editing. Remove filler words only.', TRUE, 1),
  ('00000000-0000-0000-0000-000000000002', NULL, 'Framed',         'Add 1-2 lines of context before the quote. Set the stage, then let them speak.', TRUE, 2),
  ('00000000-0000-0000-0000-000000000003', NULL, 'Thread opener',  'Structure as first tweet of a thread. End with a hook. Promise something worth reading.', TRUE, 3),
  ('00000000-0000-0000-0000-000000000004', NULL, 'Aphorism',       'Compress to one punchy principle. Max 2 sentences. Should be quotable standalone.', TRUE, 4)
ON CONFLICT (id) DO NOTHING;

-- Prompt versions — full history of every system prompt
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL, -- extraction | debrief | script | visual | posts
  version INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  model TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom extraction fields — user-added instructions injected into extraction prompt
CREATE TABLE IF NOT EXISTS public.custom_extraction_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_idea_cards_user ON public.idea_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_idea_cards_session ON public.idea_cards(session_id);
CREATE INDEX IF NOT EXISTS idx_scripts_user ON public.scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_session ON public.scripts(session_id);
CREATE INDEX IF NOT EXISTS idx_productions_user ON public.productions(user_id);
CREATE INDEX IF NOT EXISTS idx_productions_session ON public.productions(session_id);
CREATE INDEX IF NOT EXISTS idx_productions_script ON public.productions(script_id);
CREATE INDEX IF NOT EXISTS idx_segment_assets_production ON public.segment_assets(production_id);
CREATE INDEX IF NOT EXISTS idx_debrief_messages_session ON public.debrief_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_post_candidates_user ON public.post_candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_post_candidates_status ON public.post_candidates(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user ON public.scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_marinating_user ON public.marinating_ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_key ON public.prompt_versions(prompt_key);
CREATE INDEX IF NOT EXISTS idx_style_cards_user ON public.style_cards(user_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.style_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marinating_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debrief_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_format_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_extraction_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Style cards policies
CREATE POLICY "style_cards_own" ON public.style_cards FOR ALL USING (auth.uid() = user_id);

-- Idea cards policies
CREATE POLICY "idea_cards_own" ON public.idea_cards FOR ALL USING (auth.uid() = user_id);

-- Marinating ideas policies
CREATE POLICY "marinating_ideas_own" ON public.marinating_ideas FOR ALL USING (auth.uid() = user_id);

-- Debrief messages policies
CREATE POLICY "debrief_messages_own" ON public.debrief_messages FOR ALL USING (auth.uid() = user_id);

-- Scripts policies
CREATE POLICY "scripts_own" ON public.scripts FOR ALL USING (auth.uid() = user_id);

-- Productions policies
CREATE POLICY "productions_own" ON public.productions FOR ALL USING (auth.uid() = user_id);

-- Segment assets policies (via production ownership)
CREATE POLICY "segment_assets_own" ON public.segment_assets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.productions p WHERE p.id = production_id AND p.user_id = auth.uid())
);

-- Post candidates policies
CREATE POLICY "post_candidates_own" ON public.post_candidates FOR ALL USING (auth.uid() = user_id);

-- Scheduled posts policies
CREATE POLICY "scheduled_posts_own" ON public.scheduled_posts FOR ALL USING (auth.uid() = user_id);

-- Post format templates: read system templates + own templates
CREATE POLICY "post_format_templates_read" ON public.post_format_templates
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "post_format_templates_write" ON public.post_format_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_format_templates_update" ON public.post_format_templates
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "post_format_templates_delete" ON public.post_format_templates
  FOR DELETE USING (auth.uid() = user_id);

-- Prompt versions policies
CREATE POLICY "prompt_versions_own" ON public.prompt_versions FOR ALL USING (auth.uid() = user_id);

-- Custom extraction fields policies
CREATE POLICY "custom_extraction_fields_own" ON public.custom_extraction_fields FOR ALL USING (auth.uid() = user_id);

-- Push subscriptions policies
CREATE POLICY "push_subscriptions_own" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id);
