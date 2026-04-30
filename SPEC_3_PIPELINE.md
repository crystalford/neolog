# Neolog — Upload & Extraction Pipeline

## Entry Point
User drops video on /dashboard/videos → multipart R2 upload (50MB chunks, browser-direct via presigned URLs) → register in video_uploads → fire Inngest event `video-upload/process`

## Stage 1 — Audio Extraction
- Service: Replicate fofr/toolkit, task=extract_audio
- Input: R2 signed URL of original video
- Output: MP3 → stored at {userId}/audio/{uploadId}.mp3 in R2
- Skipped for: text files, already-audio files
- Cost: ~$0.01–0.02/video

## Stage 2 — HEVC Transcode (DJI / Apple files)
- Service: Replicate fofr/toolkit, task=convert_input_to_mp4
- When: mime_type is not video/mp4 (e.g. video/quicktime, HEVC)
- Output: H.264 MP4 → stored at {userId}/playback/{uploadId}.mp4 in R2
- Why: HEVC from DJI doesn't play in Chrome; also needed for browser frame capture
- IMPORTANT: Transcode runs BEFORE thumbnail frame extraction — DJI rotation metadata causes 0 frames if not transcoded first

## Stage 3 — Recording Date Extraction
- Method 1: Parse MP4 mvhd atom — reads head 2MB, then tail 4MB (DJI writes moov at end of file)
- Method 2: Filename pattern matching (YYYYMMDD, YYYY-MM-DD, YYYYMMDD_HHMMSS, etc.)
- Method 3: Fallback to upload created_at
- Stored in: video_uploads.recorded_at

## Stage 4 — Transcription
- Primary: Groq whisper-large-v3-turbo (https://api.groq.com/openai/v1/audio/transcriptions)
  - Format: verbose_json with word + segment granularity
  - 25MB upload limit
- Files >24MB: chunked via chunkBuffer(), merged via mergeTranscriptions() from src/lib/audio-processing.ts
- Fallback: Replicate openai/whisper (if no Groq key)
- Cost: ~$0.02/30min video on Groq; free tier 120min/day
- Stored:
  - video_uploads.transcript (full text)
  - video_uploads.transcript_segments (segment-level JSONB)
  - transcript_words table (word-level timestamps for seek-to-word)

## Stage 5 — AI Analysis
- Service: Claude claude-haiku-4-5 (primary) or GPT-4o (fallback)
- Input: full transcript text + user name + voice profile context
- Max output: 8192 tokens
- Prompt file: src/lib/video-analysis.ts → ANALYSIS_SYSTEM_PROMPT
- Cost: ~$0.03–0.08/video
- Stored: video_uploads.analysis (JSONB)

### Full Extraction Schema (VideoAnalysis)
Core:
- title — 5–8 word noun-phrase headline
- key_win — single most significant thing (1 punchy sentence)
- summary — 2–3 sentences third person
- summary_first_person — same in "I" voice
- emotional_arc — how mood/energy shifted
- mood — energized/reflective/frustrated/excited/anxious/calm/scattered/focused/etc
- energy_level — high/medium/low
- reflections — {observation, challenge, encouragement}
- rewrite — polished first-person rewrite of transcript
- categories[] — [{name, confidence}]

Ideas & Creativity:
- ideas[] — [{text, type: business|creative|product|content|philosophical|other, confidence}]
- questions[] — unanswered questions raised
- recurring_themes[] — things that keep coming up
- strong_opinions[] — essay-worthy takes
- content_ideas[] — [{topic, format: article|video|thread|newsletter|social_post|other}]
- stories_told[] — narratives/anecdotes that are strong content candidates
- key_quotes[] — up to 7 verbatim insightful quotes

Work & Projects:
- projects[] — [{name (canonical), status: active|idea|stalled|completed|mentioned, updates[], framing (1 sentence), project_type, full_context (2–3 paragraphs)}]
- action_items[] — [{task, context, urgency: now|soon|someday}]
- decisions[] — [{decision, reasoning}]
- blockers[] — obstacles, friction, time sinks

Personal:
- life_events[] — notable personal events
- habits[] — [{habit, sentiment: positive|negative|neutral}]
- goals[] — [{goal, timeframe: short_term|long_term|unspecified}]
- commitments[] — promises to self or others
- values_expressed[] — principles that clearly matter
- people_mentioned[] — [{name, context, relationship}]

Learning:
- references[] — [{title, type: book|article|video|podcast|person|concept|tool|other}]
- skills_mentioned[] — skills being used or learned
- lessons_learned[] — realizations and insights
- tools_mentioned[] — [{name, context}]
- principles[] — articulated rules/frameworks

Meta:
- topics[] — flat keyword list
- health_mentions — {sleep, energy (1–10), workout, body_notes}
- pii_detected[] — [{type, description (NOT actual data), approximate_location}]
- contains_sensitive_content — boolean
- language — detected language code

## Stage 6 — Entity Extraction
- From: the entities field in analysis (projects, ideas, people, goals, decisions, values)
- Only high-confidence ideas (>=0.7) become entities
- Deduplication: same concept → most specific canonical name
- Stored:
  - entities table (deduplicated canonical records, one per unique user+type+slug)
  - entity_mentions table (per-video mention with context + sentiment)

## Stage 7 — Post Suggestions
- From: generatePostSuggestions() using analysis + recording date
- Stored: social_queue table with status='suggested'

## Thumbnail (NOT in the Inngest pipeline)
- Browser-side only: canvas drawImage() + toDataURL() when user opens video
- Stored as data:image/jpeg;base64,... directly in video_uploads.thumbnail_url
- Zero Replicate cost, zero rate-limit dependency
- Route: POST /api/video-upload/save-thumbnail
- Trigger: GET /api/system/list-missing-thumbnails returns signed playback URLs for browser capture

## What Is Extracted But Never Displayed
- decisions, blockers, life_events, habits, goals, commitments
- values_expressed, people_mentioned, references, skills_mentioned
- lessons_learned, stories_told, questions, rewrite, summary_first_person
- health_mentions, tools_mentioned, principles
- word-level timestamps in transcript_words table

## Known Problems
1. stories_told is highest-value field for content pipeline — extracted, never surfaced
2. System UI shows a short stub prompt — real ANALYSIS_SYSTEM_PROMPT in video-analysis.ts is longer and out of sync
3. Many | string fallbacks in VideoAnalysis type — schema has drifted, old records don't match
4. Everything crammed into one Claude call — one transcript → one JSON blob
5. Entities extracted from AI summary, not directly from transcript (extra inference layer)
6. action_items and reflections have no persistence — can't check off tasks
7. Replicate rate-limited at <$5 account balance (6 req/min)
