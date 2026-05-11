-- Neolog — Cloudflare D1 schema (SQLite).
-- Single-operator app. Authentication via Cloudflare Access. No RLS.
-- Every query MUST filter by the operator identity (email from Access JWT)
-- in application code. Service-token-authenticated Workers see all rows.
--
-- This is the canonical schema, written fresh from filament-update/NEOLOG_SCHEMA.md
-- and adapted from Postgres → SQLite:
--   * uuid → TEXT (caller generates ULIDs / UUIDs)
--   * jsonb → TEXT (parsed as JSON in code)
--   * timestamptz → INTEGER (unix epoch ms) or TEXT (ISO 8601). We use TEXT ISO.
--   * boolean → INTEGER (0/1)
--   * enum → TEXT with CHECK constraint
--
-- Conventions:
--   * Every table has `created_at` and `updated_at` (TEXT, ISO 8601 UTC, default CURRENT_TIMESTAMP).
--   * Soft delete via `deleted_at TEXT NULL` on operator-facing tables.
--   * Indexes listed per table.
--   * Foreign keys are declared; cascade behavior follows the spec.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =============================================================================
-- 1. Operator identity
-- =============================================================================

-- Single operator (this is a single-tenant app). Row keyed by Cloudflare Access
-- email. Reference corpus for the "Operator default" voice profile auto-populated
-- from threads after extraction has run.
CREATE TABLE operator (
  id                        TEXT PRIMARY KEY,                  -- ULID at insert time
  email                     TEXT UNIQUE NOT NULL,              -- from Cloudflare Access JWT
  display_name              TEXT,
  handle                    TEXT UNIQUE,                       -- for future public profile at neolog.ai/{handle}
  bio                       TEXT,
  background                TEXT,                              -- identity context fed to ideator
  current_focus             TEXT,                              -- what they're actively working on
  tz                        TEXT DEFAULT 'America/Toronto',
  default_voice_profile_id  TEXT,                              -- → voice_profiles.id (set after voice profile exists)
  public_share_enabled      INTEGER NOT NULL DEFAULT 0,        -- 0/1; gates /{handle} public URL
  created_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_operator_email ON operator(email);

-- Voice profiles. "Operator default" only in initial scope; characters added later.
CREATE TABLE voice_profiles (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,                       -- "Operator default" / character names later
  kind                     TEXT NOT NULL CHECK (kind IN ('operator', 'character', 'external_reference')),
  description              TEXT,
  reference_texts          TEXT,                                -- JSON array of reference text snippets
  cadence_notes            TEXT,
  register_notes           TEXT,
  vocabulary_preferences   TEXT,
  is_default               INTEGER NOT NULL DEFAULT 0,
  archived                 INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_voice_profiles_operator ON voice_profiles(operator_id);
CREATE INDEX idx_voice_profiles_default ON voice_profiles(operator_id, is_default);

-- =============================================================================
-- 2. Capture substrate
-- =============================================================================

-- The vlog as a stored object plus its derived fields.
-- r2_key is the path in the neolog-videos R2 bucket where the original file lives.
-- The locked thumbnail + recorded_at logic populates thumbnail_url (data URI)
-- and recorded_at (with recorded_at_source attribution).
CREATE TABLE vlogs (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  r2_key                   TEXT NOT NULL,                       -- path in R2 (existing UUID-prefixed paths preserved)
  original_filename        TEXT,
  file_size_bytes          INTEGER,
  mime_type                TEXT,
  duration_seconds         REAL,
  recorded_at              TEXT,                                -- ISO 8601 UTC, from mvhd / filename / upload_time
  recorded_at_source       TEXT CHECK (recorded_at_source IN ('pre_extracted','mvhd','filename','upload_time_default','manual')),
  uploaded_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  thumbnail_url            TEXT,                                -- data:image/jpeg;base64,... (LOCKED format)
  transcoded_r2_key        TEXT,                                -- H.264 transcode of HEVC sources for browser playback
  transcript_text          TEXT,                                -- full plain-text transcript
  transcript_provider      TEXT CHECK (transcript_provider IN ('workers_ai_whisper','manual')),
  transcript_completed_at  TEXT,
  pipeline_status          TEXT NOT NULL DEFAULT 'uploaded' CHECK (pipeline_status IN (
    'uploaded','transcoding','transcribing','extracting','complete','archived','failed'
  )),
  pipeline_error           TEXT,
  visibility               TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_vlogs_operator ON vlogs(operator_id);
CREATE INDEX idx_vlogs_recorded_at ON vlogs(recorded_at DESC);
CREATE INDEX idx_vlogs_pipeline_status ON vlogs(pipeline_status);
CREATE INDEX idx_vlogs_r2_key ON vlogs(r2_key);

-- Word-level timestamps from Workers AI Whisper.
-- transcript_span computation on threads / clip_candidates derives from this table.
CREATE TABLE transcript_words (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  vlog_id                  TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  word                     TEXT NOT NULL,
  start_time               REAL NOT NULL,                       -- seconds from start of audio
  end_time                 REAL NOT NULL,
  word_index               INTEGER NOT NULL,
  speaker                  TEXT,                                -- for multi-speaker; usually null
  UNIQUE(vlog_id, word_index)
);
CREATE INDEX idx_transcript_words_vlog ON transcript_words(vlog_id);
CREATE INDEX idx_transcript_words_vlog_time ON transcript_words(vlog_id, start_time);

-- B-roll asset library. Visual-tagged but NOT transcribed.
CREATE TABLE broll_assets (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  r2_key                   TEXT NOT NULL,
  original_filename        TEXT,
  file_size_bytes          INTEGER,
  duration_seconds         REAL,
  recorded_at              TEXT,
  source                   TEXT CHECK (source IN ('record_app','upload')),
  thumbnail_url            TEXT,
  auto_tags                TEXT,                                -- JSON: {subject, location, mood, motion, time_of_day, lighting, color_palette, weather, season}
  operator_notes           TEXT,
  is_signature             INTEGER NOT NULL DEFAULT 0,          -- flagged as recurring motif
  usage_count              INTEGER NOT NULL DEFAULT 0,
  vision_tagged_at         TEXT,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_broll_operator ON broll_assets(operator_id);
CREATE INDEX idx_broll_signature ON broll_assets(operator_id, is_signature);

-- Reference attachments: PDFs, screenshots, articles, documents attached to clusters/projects.
CREATE TABLE attachments (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  r2_key                   TEXT NOT NULL,
  original_filename        TEXT,
  file_size_bytes          INTEGER,
  mime_type                TEXT,
  kind                     TEXT CHECK (kind IN ('pdf','image','screenshot','article','document')),
  extracted_text           TEXT,                                -- OCR / PDF text for search
  recorded_at              TEXT,
  uploaded_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attached_to_kind         TEXT CHECK (attached_to_kind IN ('cluster','project') OR attached_to_kind IS NULL),
  attached_to_id           TEXT,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_attachments_operator ON attachments(operator_id);
CREATE INDEX idx_attachments_attached_to ON attachments(attached_to_kind, attached_to_id);

-- =============================================================================
-- 3. Extraction outputs — graph nodes
-- =============================================================================

-- The thread is the atomic unit. Most vlogs produce 1–3 threads.
-- Voice preservation hard rule: take + at least one key_quote must contain a
-- verbatim 4+ word substring from the source transcript. Enforced in code,
-- not schema — failed runs do NOT write.
CREATE TABLE threads (
  id                          TEXT PRIMARY KEY,
  operator_id                 TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  vlog_id                     TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
  topic                       TEXT NOT NULL,                    -- system-generated one-line topic
  take                        TEXT,                             -- operator's position; NULL if descriptive only
  key_quotes                  TEXT,                             -- JSON array of {text, start_time, end_time}
  questions_raised            TEXT,                             -- JSON array of strings
  register                    TEXT CHECK (register IN ('riff','observation','argument','story','aside','question')),
  strength                    INTEGER CHECK (strength BETWEEN 1 AND 5),
  transcript_span_start       REAL,
  transcript_span_end         REAL,
  abstracted_topic            TEXT,                             -- for cross-vlog clustering
  extraction_prompt_version   TEXT NOT NULL,                    -- → prompts table (name + version)
  extracted_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cluster_id                  TEXT,                             -- → clusters.id if auto-linked
  deleted_at                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_threads_operator ON threads(operator_id);
CREATE INDEX idx_threads_vlog ON threads(vlog_id);
CREATE INDEX idx_threads_abstracted_topic ON threads(abstracted_topic);
CREATE INDEX idx_threads_strength ON threads(operator_id, strength DESC);
CREATE INDEX idx_threads_cluster ON threads(cluster_id);

-- Creative-mode pass output: fictional/creative material for projects.
CREATE TABLE creative_elements (
  id                          TEXT PRIMARY KEY,
  operator_id                 TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  vlog_id                     TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
  project_id                  TEXT,                             -- → projects.id (nullable; assigned during cultivation)
  element_type                TEXT NOT NULL CHECK (element_type IN (
    'character_beat','scene_fragment','dialogue','theme','setting','tonal_reference','plot_fragment'
  )),
  content                     TEXT NOT NULL,
  register                    TEXT,
  transcript_span_start       REAL,
  transcript_span_end         REAL,
  extraction_prompt_version   TEXT NOT NULL,
  deleted_at                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_creative_operator ON creative_elements(operator_id);
CREATE INDEX idx_creative_vlog ON creative_elements(vlog_id);
CREATE INDEX idx_creative_project ON creative_elements(project_id);
CREATE INDEX idx_creative_type ON creative_elements(element_type);

-- Clip-candidate pass output: delivery moments where the operator nailed a segment.
CREATE TABLE clip_candidates (
  id                          TEXT PRIMARY KEY,
  operator_id                 TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  vlog_id                     TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
  start_time                  REAL NOT NULL,
  end_time                    REAL NOT NULL,
  headline                    TEXT NOT NULL,                    -- 5-8 word summary
  quote                       TEXT,
  why_clippable               TEXT,                             -- JSON array of signals: ['delivery_clean','take_landed','self_contained','energy_right']
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','published','skipped')),
  published_to                TEXT,                             -- JSON {platform, url, published_at}
  published_clip_r2_key       TEXT,
  engagement                  TEXT,                             -- JSON {views, reposts, replies, likes}
  visibility                  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  extraction_prompt_version   TEXT NOT NULL,
  deleted_at                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_clip_operator ON clip_candidates(operator_id);
CREATE INDEX idx_clip_vlog ON clip_candidates(vlog_id);
CREATE INDEX idx_clip_status ON clip_candidates(operator_id, status);

-- Entities: people, places, projects, tools, concepts, themes, references.
CREATE TABLE entities (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  entity_type              TEXT NOT NULL CHECK (entity_type IN ('person','place','project','tool','concept','theme','reference')),
  aliases                  TEXT,                                -- JSON array of alternate names for dedup
  notes                    TEXT,
  mention_count            INTEGER NOT NULL DEFAULT 0,
  first_mentioned_at       TEXT,
  last_mentioned_at        TEXT,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_entities_operator ON entities(operator_id);
CREATE INDEX idx_entities_type ON entities(operator_id, entity_type);
CREATE INDEX idx_entities_name ON entities(operator_id, name);

-- Entity mentions: polymorphic over (vlog, thread, creative_element, cluster, production).
-- Application code enforces source_id points at the right table.
CREATE TABLE entity_mentions (
  id                       TEXT PRIMARY KEY,
  entity_id                TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  source_kind              TEXT NOT NULL CHECK (source_kind IN ('vlog','thread','creative_element','cluster','production')),
  source_id                TEXT NOT NULL,
  mention_text             TEXT,                                -- actual phrase used
  mention_time             REAL,                                -- seconds offset in vlog if applicable
  confidence               REAL,                                -- 0-1 from extraction
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX idx_mentions_source ON entity_mentions(source_kind, source_id);

-- =============================================================================
-- 4. Connection graph + clusters
-- =============================================================================

-- Undirected edges between threads. Enforce thread_a_id < thread_b_id at insert time.
CREATE TABLE thread_connections (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  thread_a_id              TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  thread_b_id              TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  connection_type          TEXT NOT NULL CHECK (connection_type IN ('abstracted_topic_match','entity_overlap','temporal_adjacency','operator_manual')),
  strength                 REAL NOT NULL,                       -- 0-1
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(thread_a_id, thread_b_id),
  CHECK (thread_a_id < thread_b_id)
);
CREATE INDEX idx_thread_connections_a ON thread_connections(thread_a_id);
CREATE INDEX idx_thread_connections_b ON thread_connections(thread_b_id);

-- Clusters: thread accumulations that ripen into production candidates.
CREATE TABLE clusters (
  id                          TEXT PRIMARY KEY,
  operator_id                 TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  topic                       TEXT NOT NULL,
  take                        TEXT,
  abstracted_topic            TEXT,
  state                       TEXT NOT NULL DEFAULT 'forming' CHECK (state IN (
    'forming','surfaced','ripening','hold_for_more','ready','materialized','produced','archived'
  )),
  state_changed_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ripeness_score              INTEGER DEFAULT 0,                -- 0-100 composite
  form                        TEXT CHECK (form IN ('concept_essay','manifesto_rant','reflection','cultural_criticism','probe','aphoristic_probe','forensic') OR form IS NULL),
  length_magnitude            TEXT CHECK (length_magnitude IN ('single','short','mid','extended') OR length_magnitude IS NULL),
  verbatim_ratio_target       REAL,                             -- per-form default, operator-overridable
  bounce_required             INTEGER NOT NULL DEFAULT 0,
  forensic_mode_activated     INTEGER NOT NULL DEFAULT 0,
  parent_cluster_id           TEXT,                             -- for follow-up clusters
  last_viewed_at              TEXT,
  gap_question                TEXT,                             -- system-surfaced gap prompt
  topic_color                 TEXT,                             -- one of the ten territory colors; assigned at formation
  deleted_at                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_clusters_operator ON clusters(operator_id);
CREATE INDEX idx_clusters_state ON clusters(operator_id, state);
CREATE INDEX idx_clusters_abstracted_topic ON clusters(abstracted_topic);
CREATE INDEX idx_clusters_parent ON clusters(parent_cluster_id);

-- Many-to-many: clusters ↔ threads
CREATE TABLE cluster_threads (
  cluster_id               TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  thread_id                TEXT NOT NULL REFERENCES threads(id),
  role                     TEXT CHECK (role IN ('core','supporting','tangent','voice_anchor')),
  added_at                 TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cluster_id, thread_id)
);
CREATE INDEX idx_cluster_threads_thread ON cluster_threads(thread_id);

-- Adjacent insights from bounce, stored on the cluster.
CREATE TABLE cluster_insights (
  id                       TEXT PRIMARY KEY,
  cluster_id               TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL CHECK (kind IN ('name','framework','parallel','counter_position','evidence','gap_question')),
  title                    TEXT,
  body                     TEXT NOT NULL,
  source_url               TEXT,
  source_label             TEXT,
  bounce_run_id            TEXT,                                -- → bounce_runs.id
  surfaced                 INTEGER NOT NULL DEFAULT 1,          -- whether to show as Surfaced card
  surfaced_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cluster_insights_cluster ON cluster_insights(cluster_id);
CREATE INDEX idx_cluster_insights_bounce ON cluster_insights(bounce_run_id);

-- Bounce execution tracking per cluster.
CREATE TABLE bounce_runs (
  id                       TEXT PRIMARY KEY,
  cluster_id               TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  mode                     TEXT NOT NULL CHECK (mode IN ('default','forensic')),
  prompt_version           TEXT NOT NULL,
  started_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at             TEXT,
  provider                 TEXT,                                -- 'claude' / 'claude_with_search'
  error                    TEXT,
  cost_usd                 REAL
);
CREATE INDEX idx_bounce_runs_cluster ON bounce_runs(cluster_id);

-- =============================================================================
-- 5. Macro-clusters (meta-synthesis layer)
-- =============================================================================

CREATE TABLE macro_clusters (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL CHECK (kind IN ('synthesis','retroactive_umbrella','missing_essay','cross_domain')),
  topic                    TEXT NOT NULL,
  take                     TEXT,
  state                    TEXT NOT NULL DEFAULT 'forming' CHECK (state IN (
    'forming','surfaced','ripening','hold_for_more','ready','materialized','produced','archived'
  )),
  state_changed_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_macro_clusters_operator ON macro_clusters(operator_id);
CREATE INDEX idx_macro_clusters_state ON macro_clusters(state);

CREATE TABLE macro_cluster_members (
  macro_cluster_id         TEXT NOT NULL REFERENCES macro_clusters(id) ON DELETE CASCADE,
  cluster_id               TEXT NOT NULL REFERENCES clusters(id),
  role                     TEXT,                                -- how this cluster contributes
  PRIMARY KEY (macro_cluster_id, cluster_id)
);

-- =============================================================================
-- 6. Productions
-- =============================================================================

CREATE TABLE productions (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  production_type          TEXT NOT NULL CHECK (production_type IN ('video_essay','article','x_post','x_thread','clip','creative_work')),
  source_kind              TEXT NOT NULL CHECK (source_kind IN ('cluster','macro_cluster','project','thread','clip_candidate')),
  source_id                TEXT NOT NULL,
  state                    TEXT NOT NULL DEFAULT 'materializing' CHECK (state IN (
    'materializing','script_ready','recording','producing','produced','published','archived'
  )),
  state_changed_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voice_profile_id         TEXT REFERENCES voice_profiles(id),
  form                     TEXT,                                -- inherited from cluster
  length_magnitude         TEXT,
  forensic_mode            INTEGER NOT NULL DEFAULT 0,
  tier                     TEXT NOT NULL DEFAULT 'lo_fi' CHECK (tier IN ('lo_fi')),  -- Lo-Fi only initially; Hi-Fi added later
  script_text              TEXT,
  script_version           INTEGER NOT NULL DEFAULT 1,
  output_r2_key            TEXT,                                -- final video file or article markdown
  output_metadata          TEXT,                                -- JSON
  published_to             TEXT,                                -- JSON {platform, url, published_at}
  engagement               TEXT,                                -- JSON
  produced_at              TEXT,
  prompt_version           TEXT,
  visibility               TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  estimated_cost_cents     INTEGER,                             -- present but unused until tier picker exists
  user_approved_cost       INTEGER,                             -- present but unused until tier picker exists
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_productions_operator ON productions(operator_id);
CREATE INDEX idx_productions_source ON productions(source_kind, source_id);
CREATE INDEX idx_productions_state ON productions(operator_id, state);
CREATE INDEX idx_productions_type ON productions(production_type);

-- For video_essay productions: beat-level decomposition.
CREATE TABLE production_beats (
  id                       TEXT PRIMARY KEY,
  production_id            TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  beat_index               INTEGER NOT NULL,
  beat_text                TEXT NOT NULL,
  cue                      TEXT,                                -- small mono note above beat
  audio_r2_key             TEXT,                                -- recorded audio for this beat
  take_number              INTEGER NOT NULL DEFAULT 1,
  superseded_takes         TEXT,                                -- JSON array of prior take audio keys
  recorded_at              TEXT,
  visual_treatment         TEXT,                                -- JSON spec for the per-beat visual sequence
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(production_id, beat_index)
);
CREATE INDEX idx_production_beats_production ON production_beats(production_id);

-- Per-beat visual assets: generated images/clips, B-roll refs, archival.
CREATE TABLE production_visual_assets (
  id                       TEXT PRIMARY KEY,
  production_id            TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  beat_id                  TEXT REFERENCES production_beats(id) ON DELETE CASCADE,
  shot_index               INTEGER,                             -- position within the beat's visual sequence
  asset_kind               TEXT NOT NULL CHECK (asset_kind IN ('broll_ref','archival','generated_image','generated_clip')),
  broll_asset_id           TEXT REFERENCES broll_assets(id),
  prompt                   TEXT,                                -- for generated assets
  r2_key                   TEXT,                                -- for generated/archival
  is_diegetic_anchor       INTEGER NOT NULL DEFAULT 0,          -- the wide shot in the sequence
  parent_anchor_id         TEXT,                                -- shots in sequence reference the anchor
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_production_visuals_production ON production_visual_assets(production_id);
CREATE INDEX idx_production_visuals_beat ON production_visual_assets(beat_id);

-- Motifs: recurring visual / phrasal / structural elements across productions.
CREATE TABLE motifs (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  description              TEXT,
  kind                     TEXT NOT NULL CHECK (kind IN ('visual','phrasal','structural')),
  recurrence_count         INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_motifs_operator ON motifs(operator_id);

CREATE TABLE production_motifs (
  production_id            TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  motif_id                 TEXT NOT NULL REFERENCES motifs(id) ON DELETE CASCADE,
  PRIMARY KEY (production_id, motif_id)
);

-- =============================================================================
-- 7. Projects (creative_work containers)
-- =============================================================================

CREATE TABLE projects (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,                       -- "Pack Rats", "The Mechanical Bride"
  tagline                  TEXT,
  blurb                    TEXT,
  state                    TEXT NOT NULL DEFAULT 'developing' CHECK (state IN ('developing','materializing','produced','dormant')),
  themes                   TEXT,                                -- JSON array of theme strings
  mood_references          TEXT,                                -- JSON array of {kind, label, url}
  last_activity_at         TEXT,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_projects_operator ON projects(operator_id);
CREATE INDEX idx_projects_state ON projects(operator_id, state);

CREATE TABLE characters (
  id                       TEXT PRIMARY KEY,
  project_id               TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  role                     TEXT,                                -- "Lead", "Supporting", "Posthumous"
  description              TEXT,
  voice_profile_id         TEXT REFERENCES voice_profiles(id), -- kind='character'
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_characters_project ON characters(project_id);

-- =============================================================================
-- 8. Surfaced cards — system-generated Timeline cards
-- =============================================================================

CREATE TABLE surfaced_cards (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  subtype                  TEXT NOT NULL CHECK (subtype IN ('cluster_ready','adjacent_insight','gap_question','new_evidence','auto_link')),
  body                     TEXT NOT NULL,
  body_html                TEXT,                                -- rich rendering with bolding
  topic_color              TEXT,                                -- hex code for left-rule (from cluster's topic_color)
  refs                     TEXT,                                -- JSON array of {kind, id, label}
  surfaced_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at                  TEXT,
  dismissed_at             TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_surfaced_operator ON surfaced_cards(operator_id);
CREATE INDEX idx_surfaced_at ON surfaced_cards(operator_id, surfaced_at DESC);
CREATE INDEX idx_surfaced_subtype ON surfaced_cards(subtype);

-- =============================================================================
-- 9. Posts (x_post / x_thread surfaced on Timeline as Post cards)
-- =============================================================================

CREATE TABLE posts (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL CHECK (kind IN ('x_post','x_thread')),
  source_kind              TEXT NOT NULL CHECK (source_kind IN ('thread','cluster','production','manual')),
  source_id                TEXT,
  is_companion_drop        INTEGER NOT NULL DEFAULT 0,          -- tied to a parent production
  parent_production_id     TEXT REFERENCES productions(id),
  body                     TEXT,                                -- for x_post; first post for x_thread
  thread_steps             TEXT,                                -- JSON array of {index, text} for x_thread
  character_count          INTEGER,
  state                    TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','scheduled','published','skipped')),
  published_to             TEXT,                                -- JSON {platform, url, published_at}
  engagement               TEXT,                                -- JSON
  auto_archive_at          TEXT,                                -- 14-day default
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_posts_operator ON posts(operator_id);
CREATE INDEX idx_posts_state ON posts(operator_id, state);
CREATE INDEX idx_posts_parent_production ON posts(parent_production_id);

-- =============================================================================
-- 10. System / pipelines / audit
-- =============================================================================

-- Versioned prompt library. Loaded by name + is_active=1.
CREATE TABLE prompts (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,                       -- 'thread_extraction', 'cluster_bounce', 'ideator_video_essay'
  version                  TEXT NOT NULL,                       -- 'v1', 'v2', etc.
  body                     TEXT NOT NULL,                       -- the prompt template
  model                    TEXT NOT NULL,                       -- 'claude-sonnet-4-6'
  is_active                INTEGER NOT NULL DEFAULT 1,
  notes                    TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by               TEXT,
  UNIQUE(name, version)
);
CREATE INDEX idx_prompts_active ON prompts(name, is_active);

-- Extraction audit trail.
CREATE TABLE extraction_runs (
  id                       TEXT PRIMARY KEY,
  vlog_id                  TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
  pass                     TEXT NOT NULL CHECK (pass IN ('analytical','creative_mode','clip_candidate','entity')),
  prompt_version           TEXT NOT NULL,
  started_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at             TEXT,
  output_count             INTEGER NOT NULL DEFAULT 0,
  error                    TEXT,
  model                    TEXT,
  cost_usd                 REAL
);
CREATE INDEX idx_extraction_runs_vlog ON extraction_runs(vlog_id);
CREATE INDEX idx_extraction_runs_pass ON extraction_runs(pass);

-- Workflow execution tracking — replicated for audit even though Cloudflare Workflows
-- has its own state. This is the operator-visible status surface.
CREATE TABLE pipeline_jobs (
  id                       TEXT PRIMARY KEY,
  workflow_id              TEXT,                                -- from Cloudflare Workflows
  job_kind                 TEXT NOT NULL,                       -- 'process_upload', 'extract_threads', 'bounce', 'produce', etc.
  payload                  TEXT,                                -- JSON
  state                    TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','complete','failed')),
  started_at               TEXT,
  completed_at             TEXT,
  error                    TEXT,
  retry_count              INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pipeline_jobs_state ON pipeline_jobs(state);
CREATE INDEX idx_pipeline_jobs_kind ON pipeline_jobs(job_kind);
CREATE INDEX idx_pipeline_jobs_workflow ON pipeline_jobs(workflow_id);

-- =============================================================================
-- Seed: initial prompts (placeholders — real bodies inserted by db/seed.sql)
-- =============================================================================
-- Initial prompts are seeded by db/seed.sql so this schema file stays pure DDL.
