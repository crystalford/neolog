# Neolog Extraction Engine — Full Schematic

## Input
Video file uploaded via multipart R2 → Inngest event `video-upload/process` fired with `{ uploadId, userId }`

---

## Stage 1 — Audio Extraction
- **Service**: Replicate `fofr/toolkit` task=`extract_audio`
- **Input**: R2 signed URL of original video
- **Output**: MP3 → stored at `{userId}/audio/{uploadId}.mp3` in R2
- **Skipped for**: text files, already-audio files

---

## Stage 2 — HEVC Transcode (DJI files only)
- **Service**: Replicate `fofr/toolkit` task=`convert_input_to_mp4`
- **When**: mime_type is not `video/mp4` (e.g. `video/quicktime`, HEVC)
- **Output**: H.264 MP4 → stored at `{userId}/playback/{uploadId}.mp4` in R2
- **Also enables**: browser-side canvas frame capture for thumbnails

---

## Stage 3 — Transcription
- **Service**: Groq `whisper-large-v3-turbo` (primary) / Replicate Whisper (fallback)
- **Format**: `verbose_json` — word-level + segment-level timestamps
- **Files >24MB**: chunked, transcribed in pieces, merged
- **Cost**: ~$0.02/30min video on Groq; free tier: 120min/day
- **Stored**:
  - `video_uploads.transcript` — full plain text
  - `video_uploads.transcript_segments` — segment-level array
  - `transcript_words` table — word-level timestamps (for seek-to-word features)

---

## Stage 4 — AI Analysis
- **Service**: Claude `claude-haiku-4-5` via Anthropic SDK (GPT-4o fallback)
- **Cost**: ~$0.03–0.08/video
- **Input**: full transcript + user name
- **Prompt**: `ANALYSIS_SYSTEM_PROMPT` in `src/lib/video-analysis.ts`
- **Stored**: `video_uploads.analysis` (JSONB)

### Full extraction schema (VideoAnalysis type in src/types/database.ts):

| Field | Type | Description |
|---|---|---|
| `title` | string | 5–8 word headline |
| `key_win` | string | single most significant thing |
| `summary` | string | 2–3 sentence narrative |
| `summary_first_person` | string | same in "I" voice |
| `emotional_arc` | string | how mood/energy shifted |
| `mood` | string | current mood |
| `energy_level` | `high/medium/low` | energy reading |
| `reflections` | `{observation, challenge, encouragement}` | structured reflection |
| `ideas` | `{text, type, confidence}[]` | business/creative/content ideas |
| `questions` | `string[]` | unanswered questions raised |
| `recurring_themes` | `string[]` | things that keep coming up |
| `projects` | `{name, status, updates, framing, project_type, full_context}[]` | project tracking |
| `action_items` | `{task, context, urgency}[]` | urgency: now/soon/someday |
| `decisions` | `{decision, reasoning}[]` | choices made |
| `blockers` | `string[]` | obstacles/friction |
| `life_events` | `string[]` | notable personal events |
| `habits` | `{habit, sentiment}[]` | positive/negative/neutral |
| `goals` | `{goal, timeframe}[]` | stated goals |
| `commitments` | `string[]` | promises to self or others |
| `values_expressed` | `string[]` | beliefs and principles |
| `people_mentioned` | `{name, context, relationship}[]` | people named |
| `references` | `{title, type}[]` | books, podcasts, articles cited |
| `skills_mentioned` | `string[]` | |
| `lessons_learned` | `string[]` | |
| `content_ideas` | `{topic, format}[]` | article/video/thread etc. |
| `stories_told` | `string[]` | narratives that are strong content candidates |
| `strong_opinions` | `string[]` | convictions worth turning into essays |
| `topics` | `string[]` | flat keyword list |
| `key_quotes` | `string[]` | verbatim quotable lines |
| `categories` | `{name, confidence}[]` | classifications |
| `rewrite` | `string/null` | cleaned rewrite of transcript |
| `pii_detected` | `{type, description, location}[]` | safety filter |
| `language` | `string` | detected language code |

---

## Stage 5 — Entity Extraction
- **From**: the `entities` field in the analysis output
- **Entity types**: people, projects, concepts, technologies
- **Stored**:
  - `entities` table — deduplicated canonical entity records
  - `entity_mentions` table — per-video, per-entity mention with context + sentiment

---

## Stage 6 — Post Suggestions
- **From**: `generatePostSuggestions()` using analysis + recording date
- **Stored**: `social_queue` table, `status='suggested'`

---

## Thumbnail
Not in the pipeline. Captured browser-side via canvas `drawImage` + `toDataURL` when user opens the video. Zero Replicate cost.

---

## What's displayed in the UI

### Timeline list (/dashboard/timeline):
- `title`, thumbnail, duration, `mood`, `energy_level`
- Idea count badge: `content_ideas.length + strong_opinions.length`
- IDEAS SURFACED: `content_ideas[].topic` (top 4)
- KEY QUOTES: `key_quotes` (top 3)
- STRONG OPINIONS (top 3)

### Video detail (/dashboard/timeline/[id]):
- `summary` paragraph
- Topic tags: `recurring_themes + topics + categories[]` merged
- `mood` + `energy_level` signal badges
- Key Moments: `key_quotes` (top 4 blockquotes)
- Ideas: `ideas[].text + type` (top 6)
- Actions: `action_items[].task + urgency` (top 8)
- Reflections: `observation`, `challenge`, `encouragement`
- Entities (from `entity_mentions` join)
- Full transcript (collapsible)

---

## What's extracted but never shown

- `decisions`
- `blockers`
- `life_events`
- `habits`
- `goals`
- `commitments`
- `values_expressed`
- `people_mentioned`
- `references`
- `skills_mentioned`
- `lessons_learned`
- `stories_told`
- `questions`
- `rewrite`
- `summary_first_person`
- word-level timestamps in `transcript_words` table

---

## Known problems with the current design

1. `stories_told` is probably the highest-value field for a content pipeline — extracted, never surfaced
2. The System UI shows a short stub prompt — the real `ANALYSIS_SYSTEM_PROMPT` in `video-analysis.ts` is longer and they are out of sync
3. Many `| string` fallbacks in the `VideoAnalysis` type — schema has drifted, old records don't match new shape
4. Everything is crammed into one Claude call — one transcript → one JSON blob, no retrieval, no chunking by topic
5. Entities are extracted from the AI's summary, not directly from the transcript — one extra layer of inference
6. No confidence scoring on most fields (only `ideas[]` has it)
7. `action_items` and `reflections` have no persistence — you can't check off tasks, no "done" state
