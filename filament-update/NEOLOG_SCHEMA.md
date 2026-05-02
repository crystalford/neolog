# NEOLOG — Database schema

**Version:** 1.0 — companion to NEOLOG.md
**Stack:** Supabase Postgres (existing). Cloudflare D1 considered for graph-edge tables but not adopted; everything in Postgres.
**Conventions:**
- All IDs are `uuid` (gen_random_uuid()) unless noted.
- All timestamp columns are `timestamptz` (with timezone).
- All tables have `created_at timestamptz default now()` and `updated_at timestamptz default now()` unless noted.
- Soft deletes via `deleted_at timestamptz null` on user-facing tables; hard deletes for system tables.
- Row-Level Security (RLS) policies enforce operator ownership for all user data tables.
- Indexes: every foreign key gets an index; every column queried in surfacing/filtering gets an index. Listed per table.

This document specifies **what each table holds and why**. SQL migration files are downstream from this — Claude Code writes those during build, against this spec.

---

## Overview — what changes vs current code

**Current Neolog code** (per NEOLOG.md section "Current state"):
- `auth.users` (Supabase auth)
- `video_uploads` — vlog metadata + 34-field `analysis` JSONB column
- `transcript_words` — word-level timestamps from Groq/AssemblyAI
- `entities` — deduplicated entity catalog
- `entity_mentions` — entity ↔ vlog references
- `social_queue` — x_post candidates (legacy)
- Various legacy tables (posts, post_versions, ActivityPub, subscriptions) — being dropped per the rebuild decision

**The rebuild** keeps:
- `auth.users` (untouched)
- `video_uploads` minus the `analysis` JSONB column (kept for metadata, transcripts, R2 paths)
- `transcript_words` (untouched — word-level timestamps remain useful)
- `entities` (refactored into the unified graph node model)
- `entity_mentions` (refactored into typed edges)

**The rebuild drops:**
- `video_uploads.analysis` JSONB
- `social_queue`
- Legacy posts/post_versions/ActivityPub/subscriptions tables

**The rebuild adds:** everything else specified below.

---

## Schema — by domain

### 1. Operator / identity

#### `auth.users` (kept — Supabase managed)
Standard Supabase auth schema. Untouched.

#### `operator_profiles`
One row per operator. The persistent identity context referenced in spec section 8.2.2.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | matches `auth.users.id` |
| `display_name` | text | "Chris Telford" |
| `handle` | text unique | "chris" — used in public URL |
| `bio` | text | short bio for public profile |
| `background` | text | identity context fed to ideator: who the operator is, current focus, voice signature, what they're building |
| `current_focus` | text | what they're actively working on; rotated periodically |
| `tz` | text | "America/Toronto" |
| `default_voice_profile_id` | uuid FK | → `voice_profiles.id` |
| `public_share_enabled` | boolean default false | whether `/{handle}` is a real URL |
| `public_share_url_slug` | text unique nullable | for vanity URLs distinct from handle |

**Indexes:** `handle` (unique), `default_voice_profile_id`.
**RLS:** read own row; read others' row only if `public_share_enabled = true` (limited fields).

#### `voice_profiles`
Spec 7.4.8. Library of stylistic reference sets.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | → `operator_profiles.id` |
| `name` | text | "Crystal Ford", "Operator default", "Pack Rats — Mary" |
| `kind` | text | enum: `operator` / `character` / `external_reference` |
| `description` | text | what this voice sounds like |
| `reference_texts` | jsonb | array of reference text snippets |
| `cadence_notes` | text | sentence rhythm notes |
| `register_notes` | text | tone/register notes |
| `vocabulary_preferences` | text | preferred phrases, words to avoid |
| `is_default` | boolean default false | one per operator |
| `archived` | boolean default false | |

**Indexes:** `operator_id`, `(operator_id, is_default)`.
**RLS:** read/write own.

---

### 2. Capture substrate

#### `video_uploads` (kept and modified)
Existing table. Drop `analysis` JSONB column. Keep everything else.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | (existing) |
| `operator_id` | uuid FK | (existing — was `user_id`) |
| `r2_key` | text | path in Cloudflare R2 |
| `original_filename` | text | |
| `file_size_bytes` | bigint | |
| `mime_type` | text | |
| `duration_seconds` | numeric | |
| `recorded_at` | timestamptz | from MP4 mvhd atom or operator-entered backdate |
| `recorded_at_source` | text | enum: `mvhd` / `manual` / `upload_time_default` |
| `uploaded_at` | timestamptz default now() | |
| `transcript_text` | text | full plain-text transcript from Whisper/AssemblyAI |
| `transcript_provider` | text | `groq` / `assemblyai` / `openai` |
| `transcript_completed_at` | timestamptz nullable | |
| `audio_r2_key` | text nullable | extracted audio if needed |
| `transcoded_r2_key` | text nullable | H.264 transcode for HEVC sources |
| `pipeline_status` | text | enum: `uploaded` / `transcoding` / `transcribing` / `extracting` / `complete` / `failed` |
| `pipeline_error` | text nullable | |
| **DROP:** `analysis` | jsonb | the 34-field schema — gone |

**Indexes:** `operator_id`, `recorded_at`, `pipeline_status`.
**RLS:** read/write own.

#### `transcript_words` (kept — untouched)
Existing table. Word-level timestamps. Unchanged.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `video_upload_id` | uuid FK | |
| `word` | text | |
| `start_time` | numeric | seconds from start |
| `end_time` | numeric | |
| `word_index` | int | sequence position |
| `speaker` | text nullable | for multi-speaker vlogs |

**Indexes:** `video_upload_id`, `(video_upload_id, start_time)`.

#### `broll_assets`
New. Spec 4.5.8.1, 9.2. B-roll library.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `r2_key` | text | path in Cloudflare R2 |
| `original_filename` | text | |
| `file_size_bytes` | bigint | |
| `duration_seconds` | numeric | |
| `recorded_at` | timestamptz | |
| `source` | text | enum: `record_app` / `upload` |
| `auto_tags` | jsonb | `{subject, location, mood, motion, time_of_day, lighting, color_palette, weather, season}` from vision model |
| `operator_notes` | text | operator-provided description |
| `is_signature` | boolean default false | flagged as recurring motif |
| `usage_count` | int default 0 | how many productions used this |
| `vision_tagged_at` | timestamptz nullable | |

**Indexes:** `operator_id`, `is_signature`, GIN on `auto_tags`.
**RLS:** read/write own.

#### `attachments`
New. Spec 4.5.8.4, 7.7.1. Reference material — PDFs, screenshots, articles, documents.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `r2_key` | text | path in Cloudflare R2 |
| `original_filename` | text | |
| `file_size_bytes` | bigint | |
| `mime_type` | text | `application/pdf`, `image/png`, etc. |
| `kind` | text | enum: `pdf` / `image` / `screenshot` / `article` / `document` |
| `extracted_text` | text nullable | for searchability — OCR for images, parsed text for PDFs |
| `recorded_at` | timestamptz | when material is from |
| `uploaded_at` | timestamptz default now() | |
| `attached_to_kind` | text nullable | enum: `cluster` / `project` / null (orphaned) |
| `attached_to_id` | uuid nullable | |

**Indexes:** `operator_id`, `(attached_to_kind, attached_to_id)`, full-text on `extracted_text`.
**RLS:** read/write own.

---

### 3. Extraction outputs (the graph nodes)

#### `threads`
Spec section 6 (analytical pass). The atomic unit.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `video_upload_id` | uuid FK | |
| `topic` | text | system-generated one-line topic |
| `take` | text nullable | the operator's position, if present |
| `key_quotes` | jsonb | array of `{text, start_time, end_time}` |
| `questions_raised` | jsonb | array of strings |
| `register` | text | enum: `essay` / `rant` / `reflection` / `breakthrough` (legacy field — see spec for reduction) |
| `strength` | int | 1–5, conservative scoring per spec 6.1.7 |
| `transcript_span_start` | numeric | seconds in source vlog |
| `transcript_span_end` | numeric | |
| `abstracted_topic` | text | for cross-vlog clustering — the underlying pattern |
| `extraction_prompt_version` | text | for performance attribution |
| `extracted_at` | timestamptz default now() | |
| `riff_cluster_id` | uuid nullable FK | → `clusters.id` if auto-tagged via abstracted_topic match |

**Indexes:** `operator_id`, `video_upload_id`, `abstracted_topic`, `strength`, `riff_cluster_id`.
**RLS:** read/write own.

#### `creative_elements`
Spec 7.4.16 (creative-mode pass).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `video_upload_id` | uuid FK | |
| `project_id` | uuid nullable FK | → `projects.id` |
| `element_type` | text | enum: `character_beat` / `scene_fragment` / `dialogue` / `theme` / `setting` / `tonal_reference` / `plot_fragment` |
| `content` | text | the actual material |
| `register` | text | tonal anchor |
| `transcript_span_start` | numeric | |
| `transcript_span_end` | numeric | |
| `extraction_prompt_version` | text | |

**Indexes:** `operator_id`, `video_upload_id`, `project_id`, `element_type`.
**RLS:** read/write own.

#### `clip_candidates`
Spec 7.4.15 (clip-candidate pass).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `video_upload_id` | uuid FK | |
| `start_time` | numeric | |
| `end_time` | numeric | |
| `headline` | text | 5-8 word summary |
| `quote` | text | the take quote |
| `why_clippable` | jsonb | array of signals: `delivery_clean` / `take_landed` / `self_contained` / `energy_right` |
| `status` | text | enum: `pending` / `approved` / `published` / `skipped` |
| `published_to` | jsonb nullable | `{platform, url, published_at}` if published |
| `published_clip_r2_key` | text nullable | trimmed mp4 |
| `engagement` | jsonb nullable | `{views, reposts, replies, likes}` |
| `extraction_prompt_version` | text | |

**Indexes:** `operator_id`, `video_upload_id`, `status`, `(operator_id, status)`.
**RLS:** read/write own.

#### `entities` (kept and modified)
Existing table. Refactored to unified graph node model.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | (existing) |
| `operator_id` | uuid FK | (existing — was `user_id`) |
| `name` | text | (existing) |
| `entity_type` | text | enum: `person` / `place` / `project` / `tool` / `concept` / `theme` / `reference` |
| `aliases` | jsonb | array of alternate names for dedup |
| `notes` | text nullable | operator-added context |
| `mention_count` | int | cached count |

**Indexes:** `operator_id`, `entity_type`, `(operator_id, name)` (for dedup).
**RLS:** read/write own.

#### `entity_mentions` (kept and modified)
Existing table. Refactored.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | (existing) |
| `entity_id` | uuid FK | |
| `source_kind` | text | enum: `vlog` / `thread` / `creative_element` / `cluster` / `production` |
| `source_id` | uuid | polymorphic — references the appropriate table |
| `mention_text` | text | the actual phrase used |
| `mention_time` | numeric nullable | seconds in vlog if applicable |
| `confidence` | numeric | 0–1, from extraction |

**Indexes:** `entity_id`, `(source_kind, source_id)`.
**RLS:** read/write own.

---

### 4. Connection graph + clusters

#### `thread_connections`
Spec 6.1.8 — the connection graph.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `thread_a_id` | uuid FK | → `threads.id` |
| `thread_b_id` | uuid FK | → `threads.id` |
| `connection_type` | text | enum: `abstracted_topic_match` / `entity_overlap` / `temporal_adjacency` / `operator_manual` |
| `strength` | numeric | 0–1 |
| `created_at` | timestamptz default now() | |

**Indexes:** `thread_a_id`, `thread_b_id`, `(thread_a_id, thread_b_id)` unique.
**Note:** edges are undirected — store with `thread_a_id < thread_b_id` ordering enforced.

#### `clusters`
Spec 7.3 — cluster data structure.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `topic` | text | system-generated, operator-editable |
| `take` | text nullable | the cluster's thesis |
| `abstracted_topic` | text | for macro-cluster matching |
| `state` | text | enum: `forming` / `surfaced` / `ripening` / `hold_for_more` / `ready` / `materialized` / `produced` / `archived` |
| `state_changed_at` | timestamptz | |
| `ripeness_score` | int | 0–100 composite |
| `form` | text | enum: `concept_essay` / `manifesto_rant` / `reflection` / `cultural_criticism` / `forensic` |
| `length_magnitude` | text | enum: `single` / `short` / `mid` / `extended` |
| `verbatim_ratio_target` | numeric | per-form default, operator-overridable |
| `bounce_required` | boolean default false | per-form default |
| `forensic_mode_activated` | boolean default false | |
| `parent_cluster_id` | uuid nullable FK | for follow-up clusters |
| `last_viewed_at` | timestamptz nullable | for momentum signals |
| `gap_question` | text nullable | system-surfaced gap prompt |

**Indexes:** `operator_id`, `state`, `(operator_id, state)`, `abstracted_topic`, `parent_cluster_id`.
**RLS:** read/write own.

#### `cluster_threads`
Many-to-many: clusters ←→ threads.

| Column | Type | Notes |
|---|---|---|
| `cluster_id` | uuid FK | |
| `thread_id` | uuid FK | |
| `role` | text | enum: `core` / `supporting` / `tangent` / `voice_anchor` |
| `added_at` | timestamptz default now() | |
| PRIMARY KEY | (cluster_id, thread_id) | |

**Indexes:** `cluster_id`, `thread_id`.

#### `cluster_insights`
Spec 7.5.5 — adjacent-insight feed (bounce results stored on the cluster).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `cluster_id` | uuid FK | |
| `kind` | text | enum: `name` / `framework` / `parallel` / `counter_position` / `evidence` / `gap_question` |
| `title` | text | short label |
| `body` | text | the insight |
| `source_url` | text nullable | citation when external |
| `source_label` | text nullable | "Anil Dash, Algorithmic Listening, 2018" |
| `bounce_run_id` | uuid nullable FK | which bounce run produced this |
| `surfaced` | boolean default true | whether to show on Timeline as Surfaced card |
| `surfaced_at` | timestamptz default now() | |

**Indexes:** `cluster_id`, `kind`, `bounce_run_id`.
**RLS:** read own (via cluster).

#### `bounce_runs`
Tracking for bounce executions per cluster.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `cluster_id` | uuid FK | |
| `mode` | text | enum: `default` / `forensic` |
| `prompt_version` | text | |
| `started_at` | timestamptz default now() | |
| `completed_at` | timestamptz nullable | |
| `provider` | text | `claude` / `claude_with_search` |
| `error` | text nullable | |

**Indexes:** `cluster_id`.

---

### 5. Macro-clusters

#### `macro_clusters`
Spec 7.4.12.2.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `kind` | text | enum: `synthesis` / `retroactive_umbrella` / `missing_essay` / `cross_domain` |
| `topic` | text | |
| `take` | text nullable | |
| `state` | text | same enum as `clusters.state` |
| `state_changed_at` | timestamptz | |

**Indexes:** `operator_id`, `state`.
**RLS:** read/write own.

#### `macro_cluster_members`
Many-to-many: macro_clusters ←→ clusters.

| Column | Type | Notes |
|---|---|---|
| `macro_cluster_id` | uuid FK | |
| `cluster_id` | uuid FK | |
| `role` | text | how this cluster contributes to the macro |
| PRIMARY KEY | (macro_cluster_id, cluster_id) | |

---

### 6. Productions

#### `productions`
The materialized output of a cluster (or macro_cluster, or project for creative_work).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `production_type` | text | enum: `video_essay` / `article` / `x_post` / `x_thread` / `clip` / `creative_work` |
| `source_kind` | text | enum: `cluster` / `macro_cluster` / `project` / `thread` / `clip_candidate` |
| `source_id` | uuid | polymorphic |
| `state` | text | enum: `materializing` / `script_ready` / `recording` / `producing` / `produced` / `published` / `archived` |
| `state_changed_at` | timestamptz | |
| `voice_profile_id` | uuid nullable FK | which voice profile used |
| `form` | text nullable | inherited from cluster |
| `length_magnitude` | text nullable | |
| `forensic_mode` | boolean default false | |
| `script_text` | text nullable | full script for video_essay/article |
| `script_version` | int | |
| `output_r2_key` | text nullable | final video file or article markdown |
| `output_metadata` | jsonb | `{duration, word_count, beats_count, etc.}` |
| `published_to` | jsonb nullable | `{platform, url, published_at}` |
| `engagement` | jsonb nullable | |
| `produced_at` | timestamptz nullable | |
| `prompt_version` | text | |
| `visibility` | text default 'private' | enum: `private` / `public` |

**Indexes:** `operator_id`, `(source_kind, source_id)`, `state`, `production_type`, `visibility`.
**RLS:** read/write own.

#### `production_beats`
For video_essay productions — beat-level decomposition. Spec section 8.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `production_id` | uuid FK | |
| `beat_index` | int | sequence position |
| `beat_text` | text | the prose to read |
| `cue` | text nullable | small mono note above beat (optional) |
| `audio_r2_key` | text nullable | recorded audio for this beat |
| `take_number` | int default 1 | |
| `superseded_takes` | jsonb | array of prior take audio keys |
| `recorded_at` | timestamptz nullable | |
| `visual_treatment` | jsonb nullable | the per-beat visual sequence spec |

**Indexes:** `production_id`, `(production_id, beat_index)`.

#### `production_visual_assets`
Per-beat visual assets — generated images/clips, B-roll references, archival.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `production_id` | uuid FK | |
| `beat_id` | uuid nullable FK | which beat this asset is for |
| `shot_index` | int | position within the beat's visual sequence |
| `asset_kind` | text | enum: `broll_ref` / `archival` / `generated_image` / `generated_clip` |
| `broll_asset_id` | uuid nullable FK | → `broll_assets.id` if asset_kind = broll_ref |
| `prompt` | text nullable | for generated assets |
| `r2_key` | text nullable | for generated/archival assets |
| `is_diegetic_anchor` | boolean default false | the wide shot in the sequence |
| `parent_anchor_id` | uuid nullable FK | shots in sequence reference the anchor |

**Indexes:** `production_id`, `beat_id`.

#### `motifs`
Spec section 10.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `name` | text | |
| `description` | text | |
| `kind` | text | enum: `visual` / `phrasal` / `structural` |
| `recurrence_count` | int | how often it has appeared |

**Indexes:** `operator_id`.

#### `production_motifs`
Many-to-many: productions ←→ motifs.

| production_id | uuid FK |
| motif_id | uuid FK |
| PRIMARY KEY | (production_id, motif_id) |

---

### 7. Projects (creative_work)

#### `projects`
Spec 7.4.16 — long-form creative work containers.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `name` | text | "Pack Rats" |
| `tagline` | text nullable | one-line description |
| `blurb` | text nullable | longer description |
| `state` | text | enum: `developing` / `materializing` / `produced` / `dormant` |
| `themes` | jsonb | array of theme strings |
| `mood_references` | jsonb | array of `{kind, label, url}` — visual/music/tonal anchors |
| `last_activity_at` | timestamptz | |

**Indexes:** `operator_id`, `state`.
**RLS:** read/write own.

#### `characters`
For creative_work projects.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK | |
| `name` | text | |
| `role` | text | "Lead", "Supporting", "Posthumous" |
| `description` | text | |
| `voice_profile_id` | uuid nullable FK | → `voice_profiles.id` (kind='character') |

**Indexes:** `project_id`.

---

### 8. Surfaced — system-generated cards

#### `surfaced_cards`
Spec 4.5.3. The umbrella for every system-generated Timeline card.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `subtype` | text | enum: `cluster_ready` / `adjacent_insight` / `gap_question` / `new_evidence` / `auto_link` |
| `body` | text | the card's content |
| `body_html` | text nullable | rich rendering with bolding |
| `topic_color` | text | hex code for left-rule |
| `references` | jsonb | array of `{kind, id, label}` — what nodes this card relates to |
| `surfaced_at` | timestamptz default now() | |
| `read_at` | timestamptz nullable | when operator viewed this |
| `dismissed_at` | timestamptz nullable | |

**Indexes:** `operator_id`, `surfaced_at`, `subtype`, `(operator_id, surfaced_at)`.
**RLS:** read/write own.

---

### 9. Posts (x_post / x_thread)

#### `posts`
Spec 7.4.14. The candidate / drafted / published unit for X.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operator_id` | uuid FK | |
| `kind` | text | enum: `x_post` / `x_thread` |
| `source_kind` | text | enum: `thread` / `cluster` / `production` / `manual` |
| `source_id` | uuid nullable | |
| `is_companion_drop` | boolean default false | tied to a parent production |
| `parent_production_id` | uuid nullable FK | |
| `body` | text | for x_post; first post for x_thread |
| `thread_steps` | jsonb nullable | for x_thread: array of `{index, text}` |
| `character_count` | int | computed |
| `state` | text | enum: `pending` / `scheduled` / `published` / `skipped` |
| `published_to` | jsonb nullable | `{platform, url, published_at}` |
| `engagement` | jsonb nullable | |
| `auto_archive_at` | timestamptz nullable | 14-day default per spec |

**Indexes:** `operator_id`, `state`, `parent_production_id`, `(operator_id, state)`.
**RLS:** read/write own.

---

### 10. System / pipelines

#### `extraction_runs`
Audit trail for extraction passes per vlog.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `video_upload_id` | uuid FK | |
| `pass` | text | enum: `analytical` / `creative_mode` / `clip_candidate` / `entity` |
| `prompt_version` | text | |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz nullable | |
| `output_count` | int | how many threads/elements/candidates produced |
| `error` | text nullable | |
| `model` | text | "claude-sonnet-4-5" |
| `cost_usd` | numeric | for tracking |

**Indexes:** `video_upload_id`, `pass`.

#### `prompts`
Versioned prompt library per spec section 11 (performance attribution).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | "thread_extraction", "cluster_bounce", "ideator_video_essay" |
| `version` | text | "v3" |
| `body` | text | the prompt template |
| `model` | text | which Claude model |
| `created_at` | timestamptz default now() | |
| `created_by` | text | |
| `is_active` | boolean default true | one active per name |
| `notes` | text | what changed in this version |

**Indexes:** `name`, `(name, is_active)`.

#### `pipeline_jobs`
Inngest job tracking — replicated for audit.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `inngest_event_id` | text | from Inngest |
| `job_kind` | text | "transcribe", "extract_threads", "bounce", "produce" |
| `payload` | jsonb | |
| `state` | text | enum: `queued` / `running` / `complete` / `failed` |
| `started_at` | timestamptz nullable | |
| `completed_at` | timestamptz nullable | |
| `error` | text nullable | |
| `retry_count` | int default 0 | |

**Indexes:** `state`, `job_kind`, `inngest_event_id`.

---

## Migration plan — current → new

**Step 1: Backup everything.**
- pg_dump full Supabase schema and data.
- Tag the current code commit as `pre-rebuild`.

**Step 2: Add new tables.**
All new tables (operator_profiles, voice_profiles, broll_assets, attachments, threads, creative_elements, clip_candidates, thread_connections, clusters, cluster_threads, cluster_insights, bounce_runs, macro_clusters, macro_cluster_members, productions, production_beats, production_visual_assets, motifs, production_motifs, projects, characters, surfaced_cards, posts, extraction_runs, prompts, pipeline_jobs).

Run as one migration. No data conflicts since none of these exist yet.

**Step 3: Refactor `entities` and `entity_mentions`.**
- Rename `entities.user_id` → `operator_id`.
- Add columns to `entities`: `entity_type`, `aliases`, `notes`, `mention_count`.
- Add columns to `entity_mentions`: `source_kind`, `source_id`, `mention_text`, `mention_time`, `confidence`.
- Backfill `entity_type` from existing data (best guess; operator can correct later).
- Backfill `source_kind = 'vlog'` and `source_id = old vlog reference` for all existing mentions.

**Step 4: Refactor `video_uploads`.**
- Rename `video_uploads.user_id` → `operator_id`.
- Add: `recorded_at_source`, `transcript_provider`, `transcript_completed_at`, `transcoded_r2_key`, `pipeline_status`, `pipeline_error`.
- Drop: `analysis` JSONB.
- Backfill `recorded_at_source = 'mvhd'` where mvhd-extracted; `'upload_time_default'` otherwise.
- Backfill `pipeline_status = 'complete'` for all existing rows (they're done).

**Step 5: Drop deprecated tables.**
- Drop `social_queue`.
- Drop legacy posts/post_versions/ActivityPub/subscriptions tables (per the rebuild decision in NEOLOG.md current state section).

**Step 6: Set up RLS policies on all tables.**
Read/write own data; public read on `operator_profiles` (limited fields) and on `productions/posts/clip_candidates` where `visibility = 'public'`.

**Step 7: Re-run extraction against existing transcripts.**
- For all 171 existing video_uploads with completed transcripts, queue thread-extraction, clip-candidate-extraction, creative-mode-extraction, entity-extraction passes.
- Cost estimate: ~171 vlogs × $0.20-0.30 per Sonnet call × 4 passes = roughly $30-50.
- Results populate the new tables. Old `analysis` JSONB data is gone — we accept that loss.

**Step 8: Verify against the operator's manual review.**
Operator picks 5-10 vlogs, manually reviews extracted threads/clips/elements, confirms quality before marking the new system as primary.

---

## Notes for Claude Code

- **Do not assume column names from this document are final.** Treat this as a *semantic* schema. The actual SQL column names should follow the operator's existing conventions (snake_case, plural table names, etc.). Where this document and existing code conflict on naming, existing code wins for kept tables.
- **Foreign keys with `on delete cascade`** for tightly-coupled relationships (e.g. `cluster_threads.cluster_id` cascades when cluster is deleted; `cluster_threads.thread_id` does NOT cascade — threads outlive cluster membership).
- **Polymorphic source_id columns** (in `posts`, `productions`, `entity_mentions`) are intentional. Postgres has no native polymorphic FK; enforce integrity in application code or via triggers. Resist refactoring to per-source-type tables — the polymorphism is part of the architecture.
- **Indexing budget.** Every table has indexes specified. Add more as query patterns surface; don't pre-optimize beyond what's listed.
- **JSONB usage.** Heavy. Used for: extraction outputs that are operator-readable but rarely queried (`engagement`, `auto_tags`, `output_metadata`, `references`, `mood_references`, `key_quotes`, `questions_raised`, `thread_steps`, `published_to`). Use GIN indexes only where filtering happens (`broll_assets.auto_tags`).
- **Soft delete vs hard delete.** User-facing nodes (vlogs, threads, posts, clusters, productions, projects) are soft-deleted (`deleted_at`). System tables (extraction_runs, pipeline_jobs, bounce_runs) are hard-deleted via TTL.
- **Cost tracking is in scope.** `extraction_runs.cost_usd`, plus a future `daily_cost_summary` materialized view. The operator should be able to see what the system costs them per week.

---

## Open questions for operator review

1. **Auth.** Sticking with Supabase auth (current). Confirmed?
2. **Multi-operator.** Schema is single-operator-per-row throughout. Adding teams/collaborators is out of scope. Confirmed?
3. **Public visibility.** Spec says public/private is a per-card property. The schema implements this on `productions`, `posts`, `clip_candidates`. Should `threads`, `vlogs`, `clusters` also have visibility? Probably not — the public view aggregates from published productions/posts/clips, not from raw substrate. Confirm.
4. **Creative_work production storage.** Generated video assets (Flux, Veo, Kling output) get stored as `production_visual_assets.r2_key`. Sufficient for now, or do we need a dedicated `generated_assets` table for audit/regeneration? Defer.
5. **Search.** No full-text search index defined yet. Postgres `tsvector` columns can be added incrementally on `transcript_text`, `threads.topic+take`, `clusters.topic+take`, `productions.script_text`. Defer to v1.5.
6. **Backups.** Daily Supabase backup retained 30 days (current default). Confirm sufficient.

---

*End of schema spec v1.0. This document is the substrate — every page in NEOLOG.md operates on tables specified here. Changes to either document should be reflected in the other.*
