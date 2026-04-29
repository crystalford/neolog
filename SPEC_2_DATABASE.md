# Neolog — Database Schema

## Core Upload / Pipeline Tables

### video_uploads
The central table. Every uploaded file lives here.
- id, user_id, created_at
- file_name, file_size_bytes, mime_type, duration_seconds
- storage_path, storage_provider (r2/s3/supabase), playback_path
- status: uploaded → transcribing → analyzing → processed (or error)
- transcript (full text), transcript_segments (JSONB array)
- analysis (JSONB — full VideoAnalysis object)
- generated_posts, generated_clips (JSONB)
- thumbnail_url (stored as data:image/jpeg;base64,... directly)
- recorded_at (extracted from MP4 mvhd atom or filename)
- source_deleted, processed_at
- session_id (FK to clip_sessions)

### transcript_words
Word-level transcript with timing for seek-to-word features.
- video_upload_id, user_id
- word, start_time, end_time, confidence, is_cut, word_index

## Knowledge Graph Tables

### entities
Living, accumulating concepts tracked across sessions.
- id, user_id, created_at
- type: project | idea | person | goal | question | habit | topic | commitment | skill | blocker | insight | decision | value | tool
- name, slug, summary
- status: active | dormant | resolved | abandoned
- mention_count, first_mentioned_at, last_mentioned_at
- metadata (JSONB)
- Unique constraint: (user_id, type, slug)

### entity_mentions
Each reference to an entity in a specific video.
- entity_id, video_upload_id, user_id
- context (bullet summary), full_context
- sentiment: positive | negative | neutral
- created_at

### user_synthesis
Cross-corpus synthesis across ALL of user's uploads.
- user_id, synthesized_at, upload_count
- date_range_start, date_range_end
- spine (through-line), narratives[], themes[], contradictions[]
- commitments_open[], momentum (object)
- synthesis_model

### project_documents
Synthesized project intelligence per entity.
- user_id, entity_id
- project_type: tech | book | creative | business | personal | other
- overview, decisions_log, action_items, roadmap
- technical_notes, narrative_overview, origin_story, manual_notes
- synthesis_history (rolling last-10 snapshots JSONB)
- synthesis_model, mention_count_at_synthesis, last_synthesized_at

## Content Tables

### content_drafts
AI-generated content from analysis.
- user_id, created_at
- format: video_essay | article | thread
- title, hook, body (verbatim script), word_count, estimated_duration_seconds
- source_type, source_text, source_upload_ids (array)
- status: generating | draft | ready | archived
- generation_model

### clip_sessions
Groups of uploads for cross-clip synthesis and editing.
- user_id, created_at
- status: collecting → processing → synthesized (or error)
- synthesis (JSONB: themes, narrative_arcs, connections, best_moments)
- edit_plans (JSONB)
- clip_count, total_duration_seconds

### log_entries
Structured life events surfaced in feed.
- user_id, created_at, logged_at (the real date)
- entry_type: work | food | health | finance | asset_update | social | learn | build | session | capture
- title, body, thumbnail_url
- software_tags (array), cost_delta, asset_id
- source_upload_id, source_capture_id
- meta (JSONB: entities, tags, locations)
- is_public

## Social & Publishing Tables

### post_candidates / social_queue
Auto-generated social posts from analysis.
- status: suggested | queued | published | rejected
- content, platform, source_upload_id

### posts
Core publishing table (legacy — do not remove).
- title, slug, subtitle, content, content_html
- content_type: html | markdown | rich | pulse
- status: draft | published | archived | scheduled
- cover_image_url, excerpt, reading_time_minutes
- Forking: forked_from_id, root_post_id, fork_depth, allow_forks, fork_count

### social_integrations
X / Bluesky OAuth tokens.
- user_id, provider, access_token, refresh_token, expires_at

### publications
Multi-publication support (one per user currently).
Legacy — do not remove.

## Settings / Integration Tables

### integration_keys
Per-user API keys.
- user_id, provider, key (encrypted), is_active

### storage_connections
R2 / S3 credentials for user uploads.
- user_id, provider, bucket, region, credentials JSONB

### profiles
User accounts.
- id (= auth.users.id), display_name, bio, avatar_url
- social links (twitter, github, website)
- is_pro (boolean — gates managed API keys)
- voice_profile (JSONB — accumulated voice signature)
- context (markdown — user's self-description for AI prompts)

## Legacy Tables (Do Not Remove, Do Not Build In)

- posts, post_versions, post_distribution_packs, post_collaborators
- post_views, reading_progress, post_stats, post_upvotes, curator_scores
- subscriptions, email_subscribers, subscriber_notes, subscriber_tags
- activitypub_keys, activitypub_followers, activitypub_inbox, activitypub_deliveries
- assets, post_assets, feed_sources, inbox_items, domains, api_keys
- video_briefs (HeyGen/Synthesia jobs)
