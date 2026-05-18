# Neolog — complete system reference

> Self-contained handoff document. Paste into any AI assistant or read top-to-bottom to understand the entire app. Last verified: 2026-05-18.

---

## 1. What is this?

A single-operator vlog-extraction platform. Operator records vlogs, drops them in, system transcribes + extracts threads/clips/creative-elements/entities, clusters related threads, eventually generates productions (video essays, X posts, articles, clips).

**Custom domain:** neolog.ai
**GitHub repo:** `crystalford/neolog`
**Single operator** — no multi-tenancy. Identity comes from Cloudflare Access JWT (email).

---

## 2. Hard infrastructure facts

| Resource | Value |
|---|---|
| Cloudflare Account ID | `eda2e9bbd9acc42699027cfdcb50f998` |
| Cloudflare Access team | `neolog` (sign-in: `neolog.cloudflareaccess.com`) |
| R2 bucket | `neolog-videos` |
| D1 database | `neolog` (UUID `d9db2aeb-c47b-4611-a2ba-96720939205b`) |
| Operator R2 prefix | `01KRCXWYTRN0BYTR3452ZTSXXJ/` (operator ULID; ALSO legacy `b2df4f26-6dd8-421d-bb3d-db777086079b/` for Supabase-era objects) |
| Pages project | hosts the Next.js app at `neolog.ai` |
| Container Worker | `neolog-ffmpeg` (image registry `registry.cloudflare.com/eda2e9bbd9acc42699027cfdcb50f998/neolog-ffmpeg-ffmpegcontainer`) |
| Workflow Worker | `neolog-process-upload` (post-upload pipeline) |
| Cron Worker | `neolog-healer` (5-min sweep for stuck rows) |
| Operator environment | **Claude Code Windows desktop app — no terminal, no IDE.** All shell/wrangler work runs in the assistant's session, not on the operator's machine. |

---

## 3. Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 App Router |
| Runtime | Cloudflare Workers / Pages Functions (every route has `export const runtime = 'edge'`) |
| Adapter | `@cloudflare/next-on-pages` (does NOT auto-read `[[d1_databases]]` from root wrangler.toml — bindings set via REST API in bootstrap workflow) |
| Package manager | **pnpm** (Cloudflare build uses `pnpm install --frozen-lockfile`) |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Auth | Cloudflare Access (one-time PIN to operator email) |
| Async orchestration | Cloudflare Workflows |
| Transcription | Cloudflare Workers AI Whisper (`@cf/openai/whisper-large-v3-turbo`) |
| Chat assistant | Kimi K2.6 (`@cf/moonshotai/kimi-k2.6`) default, Llama 4 Scout, Anthropic Sonnet 4.6 (operator opt-in) |
| Extraction LLMs | Workers AI Kimi (free tier) / Anthropic Sonnet 4.6 (premium/max tier) |
| Video processing | Cloudflare Container Worker running FFmpeg (Alpine + ffmpeg static) |
| Styling | Inline styles importing tokens from `src/lib/design.ts` |

---

## 4. Directory tree (every important file)

```
neolog/
├── CLAUDE.md                            ← Project rules + locked architectural decisions
├── SYSTEM_REFERENCE.md                  ← THIS FILE
├── package.json
├── wrangler.toml                        ← Root Pages project config (DB/R2/AI bindings + service bindings)
├── tsconfig.json
│
├── .github/workflows/
│   ├── bootstrap-cloudflare.yml         ← Full Cloudflare provisioning (D1, R2, Workers, bindings, deploy)
│   ├── deploy-workers.yml               ← Auto-deploy workers on push to main (+ node --check guard, container smoke test)
│   ├── deploy.yml                       ← Pages deploy
│   ├── typecheck.yml                    ← CI typecheck on PRs
│   └── ci.yml.disabled
│
├── db/
│   ├── schema.sql                       ← Canonical schema (20 tables)
│   └── migrations.sql                   ← Idempotent append-only DDL
│
├── docs/
│   └── CREDENTIALS.md                   ← Confirmed-working credentials (R2 keys, Anthropic, etc) — DO NOT ask to "re-verify"
│
├── src/
│   ├── app/
│   │   ├── (app)/                       ← Authenticated app pages
│   │   │   ├── timeline/
│   │   │   │   ├── page.tsx             ← Heterogeneous timeline feed
│   │   │   │   └── [id]/page.tsx        ← Vlog detail (playback, transcript, threads, pipeline UI)
│   │   │   ├── studio/page.tsx          ← Cluster cultivation
│   │   │   ├── chat/page.tsx            ← AI assistant (Kimi/Scout/Claude switchable)
│   │   │   ├── graph/page.tsx           ← Visual graph of nodes/edges
│   │   │   ├── projects/page.tsx        ← Long-form productions
│   │   │   ├── settings/page.tsx        ← Operator settings (default model, default tier, API keys)
│   │   │   ├── system/page.tsx          ← Health dashboard — pings every dependency
│   │   │   ├── uploads/page.tsx         ← Raw archive grid + admin batches
│   │   │   ├── capture/page.tsx         ← Drop-zone (browser audio extract + multipart upload)
│   │   │   ├── thread/[id]/page.tsx
│   │   │   ├── clip/[id]/page.tsx
│   │   │   ├── cluster/[id]/page.tsx
│   │   │   ├── article/[id]/page.tsx
│   │   │   ├── attachment/[id]/page.tsx
│   │   │   ├── broll/[id]/page.tsx
│   │   │   ├── materialize/[id]/page.tsx
│   │   │   ├── post/
│   │   │   ├── library/
│   │   │   └── states/
│   │   │
│   │   └── api/v2/
│   │       ├── vlogs/
│   │       │   ├── route.ts                       (GET list, POST register new vlog)
│   │       │   ├── duplicate-check/route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts                   (GET vlog detail + presigned playback)
│   │       │       ├── process/route.ts           (POST re-process with tier/passes)
│   │       │       ├── thumbnail/route.ts         (PUT browser-captured thumbnail)
│   │       │       ├── audio-chunks/route.ts      (PUT backfill audio chunks manifest)
│   │       │       ├── audio-chunk-presign/route.ts
│   │       │       └── events/route.ts            (GET full untruncated pipeline_events log)
│   │       ├── upload/
│   │       │   ├── initiate/route.ts              (begin multipart, get part URLs)
│   │       │   ├── complete/route.ts              (finalize multipart)
│   │       │   └── audio-chunk-presign/route.ts   (presign at upload time)
│   │       ├── timeline/route.ts                  (heterogeneous feed)
│   │       ├── threads/
│   │       │   ├── recent/route.ts
│   │       │   └── [id]/route.ts
│   │       ├── clips/[id]/route.ts
│   │       ├── clusters/route.ts
│   │       ├── clusters/[id]/route.ts
│   │       ├── projects/route.ts
│   │       ├── projects/[id]/route.ts
│   │       ├── library/route.ts
│   │       ├── graph/stats/route.ts
│   │       ├── chat/
│   │       │   ├── route.ts                       (tool-use loop)
│   │       │   └── attachment/route.ts
│   │       ├── settings/route.ts
│   │       ├── system/
│   │       │   ├── status/route.ts                ← Aggregate health, called by /system page
│   │       │   └── ffmpeg-status/route.ts         (legacy, FFmpeg-specific)
│   │       └── admin/
│   │           ├── run-migrations/route.ts        (manual safety net; auto-runs on cold start now)
│   │           ├── regenerate-thumbnails/route.ts
│   │           ├── fix-thumbnails-batch/route.ts
│   │           ├── import-r2/route.ts             (scan R2 for orphan vlogs)
│   │           ├── import-supabase-thumbnails/route.ts
│   │           └── backfill-recorded-at/route.ts
│   │
│   └── lib/
│       ├── access.ts                    ← requireOperator() from CF Access JWT
│       ├── d1.ts                        ← getDb(), findOne(), findMany(), run() — calls ensureMigrationsOnce()
│       ├── r2.ts                        ← R2 client (presign GET/PUT, multipart helpers)
│       ├── ulid.ts                      ← ULID generator
│       ├── design.ts                    ← Color/font/topic tokens
│       ├── recorded-at.ts               ← 4-tier recorded_at fallback (mvhd parser, filename regex)
│       ├── transcribe.ts                ← Whisper invocation helpers
│       ├── extract.ts                   ← 4 extraction passes (threads, clip_candidates, creative, entities)
│       ├── llm.ts                       ← Tier→model routing (free=Kimi, premium=mixed, max=Sonnet)
│       ├── anthropic.ts                 ← Claude API wrapper
│       ├── chat-tools.ts                ← Assistant tool definitions (search_vlogs, get_vlog, list_threads, etc)
│       ├── operator-settings.ts         ← Operator preference reads/writes
│       ├── migration-runner.ts          ← MIGRATIONS[] array + ensureMigrationsOnce() per-isolate memo
│       ├── pipeline-events.ts           ← Helpers to write/read pipeline_events table
│       └── browser-audio.ts             ← extractAudioChunks() — browser-side audio extract via AudioContext
│
└── workers/
    ├── ffmpeg/                          ← Container Worker (FFmpeg)
    │   ├── Dockerfile                   ← Alpine 3.21 + ffmpeg + nodejs, EXPOSE 8080
    │   ├── server.js                    ← HTTP server: /transcode-h264, /extract-thumb, /extract-audio, /trim, /concat, /health, /boot-info
    │   ├── src/worker.ts                ← Durable Object fronting the container lifecycle
    │   ├── wrangler.toml                ← instance_type=standard-1, max_instances=5
    │   └── package.json
    │
    ├── process-upload/                  ← Workflow Worker (post-upload pipeline)
    │   ├── src/workflow.ts              ← 13 steps (see §6), softStep wrapper, writes to pipeline_events
    │   ├── wrangler.toml                ← Bindings: DB, VIDEOS (R2), AI, FFMPEG (service)
    │   └── package.json
    │
    └── healer/                          ← Cron-triggered sweep
        ├── src/index.ts                 ← Scheduled handler (*/5 * * * *)
        ├── wrangler.toml                ← Triggers + DB + PROCESS_UPLOAD service binding
        └── package.json
```

---

## 5. Data flow (upload → complete vlog)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser (Chrome / Edge on Windows) — /capture page                      │
│                                                                         │
│  1. User drops video file(s)                                            │
│  2. POST /api/v2/vlogs/duplicate-check  (filename+size fingerprint)     │
│  3. POST /api/v2/upload/initiate                                        │
│     → { uploadId, key, partUrls[200], totalParts, partSize=50MB }       │
│  4. PUT each part directly to R2 presigned URL (3 concurrent)           │
│  5. POST /api/v2/upload/complete  (ETags array)                         │
│  6. Browser thumbnail capture: <video>→canvas→JPEG base64 (~15KB)       │
│  7. Browser audio extract (src/lib/browser-audio.ts):                   │
│       file.arrayBuffer() → AudioContext.decodeAudioData →               │
│       slice into 120s chunks → OfflineAudioContext resample to          │
│       16 kHz mono → WAV → PUT each to R2 via                            │
│       /api/v2/upload/audio-chunk-presign                                │
│  8. POST /api/v2/vlogs  (register) with:                                │
│       r2_key, original_filename, file_size_bytes, mime_type,            │
│       recorded_at (filename-inferred), thumbnail_blob_base64,           │
│       audio_chunks_json: [{r2_key, start_sec, end_sec, bytes}]          │
│                                                                         │
│  ↓                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ Pages Function: POST /api/v2/vlogs                                      │
│                                                                         │
│  • Validates R2 key starts with `${operator.id}/`                       │
│  • Duplicate detection in D1                                            │
│  • deriveRecordedAt() 4-tier fallback (synchronous):                    │
│       (1) client-supplied → (2) mvhd atom (presigned R2 GET first 2MB)  │
│       → (3) filename regex → (4) upload_time fallback                   │
│  • Decodes thumbnail base64 → R2 put `{op}/thumbs/{vlog_id}.jpg`        │
│  • Validates audio_chunks_json (each r2_key under upload prefix)        │
│  • INSERT vlogs row, pipeline_status='uploaded'                         │
│  • Dispatches Workflow via env.PROCESS_UPLOAD.fetch('/dispatch')        │
│  • Returns { id, pipeline_status }                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ Workflow Worker: process-upload                                         │
│ (workers/process-upload/src/workflow.ts, ~13 steps each via step.do)    │
│                                                                         │
│  Each step wrapped in softStep() — failure recorded in                  │
│  pipeline_events + (legacy) extraction_outcomes JSON, doesn't abort.    │
│                                                                         │
│   1. fetch-context — load vlog from D1                                  │
│   2. mark-transcoding — set pipeline_status='transcoding'               │
│   3. extract-thumbnail (fast cascade)                                   │
│        tier 1: FFmpeg /extract-thumb -noautorotate                      │
│        tier 2: FFmpeg /extract-thumb-mini-transcode                     │
│      Writes to R2 + sets vlogs.thumbnail_r2_key                         │
│   4. transcode-h264 (if video && !already done)                         │
│        FFmpeg /transcode-h264 → MP4 (H.264 + AAC, browser-friendly)     │
│        Writes to R2 + sets vlogs.transcoded_r2_key                      │
│   5. extract-thumbnail-fallback (only if 1+2 failed)                    │
│   6. extract-recorded-at (safety net for archived imports)              │
│   7. mark-transcribing                                                  │
│   8. transcribe                                                         │
│        If vlogs.audio_chunks_json set:                                  │
│          For each chunk: R2 GET → Workers AI Whisper                    │
│            { audio: Uint8Array }                                        │
│          Stitch transcripts, offset word timestamps by chunk.start_sec  │
│        Else (audio file): pass file bytes directly                      │
│        Writes vlogs.transcript_text + transcript_words rows             │
│   9. mark-extracting                                                    │
│  10. reload-transcript                                                  │
│  11-14. four parallel extractions (only if transcript_text exists):     │
│        - extractThreads()   → threads table                             │
│             Voice preservation: take + ≥1 key_quote must contain        │
│             verbatim 4+ word substring from transcript. Failed rows     │
│             skipped, NOT written.                                       │
│        - extractClipCandidates() → clip_candidates                      │
│        - extractCreativeElements() → creative_elements                  │
│        - extractEntities() → entities + entity_mentions                 │
│      Tier (free/premium/max) selects model per pass:                    │
│        free   = Kimi K2.6 all (~$0.04 / 20-min vlog)                    │
│        premium = Sonnet for threads+creative; Kimi for clips+entities   │
│                 (~$0.10)                                                │
│        max    = Sonnet for all four passes (~$0.17)                    │
│  15. mark-complete — set pipeline_status='complete'                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                ↓
                  Operator opens /timeline/[id]:
                  - Plays video (presigned R2 GET URL)
                  - Reads transcript_text
                  - Sees threads / clips / entities
                  - Can re-extract single pass at any tier
                  - Sees full pipeline_events log (new)
```

### Healer cron (parallel safety net)

```
Every 5 minutes:
  SELECT vlogs WHERE pipeline_status IN ('transcoding','transcribing','extracting')
                AND deleted_at IS NULL
                AND updated_at < datetime('now','-10 minutes')
  For each stuck row:
    If pipeline_restart_count < 3:
      env.PROCESS_UPLOAD.fetch('/dispatch') — re-trigger workflow
      Increment pipeline_restart_count
    Else:
      pipeline_status = 'failed'
      pipeline_error = "Auto-restart limit reached..."
```

---

## 6. D1 schema — every table

| Table | Purpose | Notable columns |
|---|---|---|
| `operator` | Identity row for the single operator | id, email, display_name, voice_profile_default |
| `voice_profiles` | Reference corpora for "operator voice" | id, operator_id, name, is_default, reference_corpus_json |
| `vlogs` | THE central table | id, operator_id, r2_key, original_filename, file_size_bytes, mime_type, duration_seconds, recorded_at, recorded_at_source CHECK('pre_extracted','mvhd','filename','upload_time_default','manual'), thumbnail_url (legacy data-URI), thumbnail_r2_key (new), transcoded_r2_key, audio_chunks_json (JSON), transcript_text, transcript_provider, transcript_completed_at, pipeline_status, pipeline_error, pipeline_restart_count, extraction_outcomes (legacy JSON, being replaced by pipeline_events), visibility, deleted_at, created_at, updated_at |
| `transcript_words` | Per-word timestamps | vlog_id, word, start_time, end_time, word_index (UNIQUE per vlog) |
| `threads` | Extraction pass 1 output | id, operator_id, vlog_id, topic, take, key_quotes (JSON), questions_raised (JSON), register CHECK(riff|observation|argument|story|aside|question), strength (1-5), transcript_span_start/end, abstracted_topic, cluster_id, extraction_prompt_version |
| `creative_elements` | Extraction pass 2 output | element_type CHECK(character_beat|scene_fragment|dialogue|theme|setting|tonal_reference|plot_fragment), content, register |
| `clip_candidates` | Extraction pass 3 output | start_time, end_time, headline, quote, why_clippable (JSON), status (pending|approved|rejected|published) |
| `entities` | Extraction pass 4 output | name, entity_type (person|place|project|tool|concept|theme|reference), aliases (JSON), mention_count, first/last_mentioned_at |
| `entity_mentions` | Per-occurrence joins | entity_id, source_kind, source_id, mention_text, mention_time, confidence |
| `thread_connections` | Manual + auto-linked thread pairs | thread_a_id, thread_b_id, connection_type, confidence |
| `clusters` | Topic clusters (forming → ready → produced) | abstracted_topic, name, state, ripeness_score, primary_action, headline, take, gap_question |
| `cluster_threads` | Thread membership in clusters | cluster_id, thread_id, role (core|supporting|tangent|voice_anchor) |
| `cluster_insights` | Surfaced realizations per cluster | kind (name|framework|parallel|counter_position|evidence|gap_question), surfaced_at |
| `bounce_runs` | Operator-AI back-and-forth on a cluster | cluster_id, exchanges_json |
| `macro_clusters` | Cross-cluster meta-topics | name, summary |
| `macro_cluster_members` | macro_cluster_id, cluster_id |
| `productions` | Materialized outputs | type (video_essay|article|x_post|x_thread|clip|creative_work), source_kind, state |
| `production_beats` | Production sequence | beat_index, beat_text, cue, audio_r2_key, visual_treatment |
| `production_visual_assets` | Per-beat visuals | beat_id, asset_kind, prompt, r2_key |
| `motifs` | Recurring visual/sound motifs | name, description, signature_r2_key |
| `production_motifs` | Per-production motif usage |
| `projects` | Long-form containers (Pack Rats, etc) | name, state, headline |
| `characters` | Fictional characters in projects | project_id, name, profile |
| `surfaced_cards` | "Cluster ready", "Auto-link", "Gap question" cards | subtype, body_html, dismissed_at |
| `posts` | Drafted X posts (manual + AI) | kind (x_post|x_thread), state, body |
| `extraction_runs` | One row per LLM call | vlog_id, pass, prompt_version, model, output_count, error, cost_usd |
| `prompts` | Versioned prompts for every extraction pass | name, version, is_active, body |
| `pipeline_jobs` | Legacy job queue | (mostly unused) |
| `broll_assets` | Visual material library | r2_key, tags, signature |
| `attachments` | Notes + pasted docs + chat uploads | attached_to_kind, attached_to_id, kind, body |
| `chat_threads` | AI assistant conversations | id, title, model |
| `chat_messages` | Per-message log | role, content, tool_calls, model |
| `chat_attachments` | Files in chat | thread_id, kind, r2_key |
| `operator_settings` | Key-value preferences | key (chat_default_model, extraction_default_tier, etc), value |
| `background_jobs` | Phase 3 (deferred) — durable batch queue | kind, status, attempts, error |
| `schema_migrations` | Bookkeeping for migration-runner.ts | name PRIMARY KEY, applied_at |
| `pipeline_events` | NEW — single source of truth for per-step status | vlog_id, step, status (started|ok|failed|skipped), runtime, worker_version, started_at, completed_at, duration_ms, error_full_text (untruncated), detail_json |

---

## 7. R2 key patterns

```
{operator_id}/uploads/{ulid}/{original_filename}        ← source video (multipart-uploaded)
{operator_id}/uploads/{ulid}/audio/chunk_{i}.wav        ← browser-extracted audio chunks (Phase 1a, at upload time)
{operator_id}/audio/{vlog_id}/chunk_{i}.wav             ← browser-extracted audio chunks (Phase 1b, backfill)
{operator_id}/thumbs/{vlog_id}.jpg                      ← thumbnail (browser or container-generated)
{operator_id}/transcoded/{vlog_id}.mp4                  ← H.264+AAC re-encode for browser playback
b2df4f26-6dd8-421d-bb3d-db777086079b/...                ← LEGACY Supabase-era videos (read in place, never migrated)
```

---

## 8. Workers + bindings

### Pages project (Next.js app)
Bindings set via REST API in `bootstrap-cloudflare.yml` (NOT in `wrangler.toml` because `@cloudflare/next-on-pages` doesn't read it).

```
[d1]      DB              → neolog
[r2]      VIDEOS          → neolog-videos
[ai]      AI              → Workers AI
[service] FFMPEG          → neolog-ffmpeg
[service] PROCESS_UPLOAD  → neolog-process-upload
```

Secrets (set via wrangler secret put):
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (for presigning)
- `ANTHROPIC_API_KEY` (Claude calls)

### neolog-ffmpeg (Container Worker)
```
[durable_object] FFMPEG_CONTAINER (class FfmpegContainer)
[container]      class_name=FfmpegContainer, image=./Dockerfile,
                 instance_type=standard-1, max_instances=5
```

HTTP endpoints inside the container (Node http server on :8080):
- `POST /transcode-h264 { input_url }` → MP4 (H.264 + AAC)
- `POST /extract-thumb { input_url, t? }` → JPEG (streaming from R2 → ffmpeg stdin)
- `POST /extract-thumb-mini-transcode { input_url, t? }` → JPEG (2-sec re-encode then frame grab)
- `POST /extract-audio { input_url }` → MP3
- `POST /trim { input_url, start_s, end_s }` → MP4
- `POST /concat { input_urls: string[] }` → MP4
- `GET /health` → `{ ok, build }`
- `GET /boot-info` → `{ ok, build, pid, uptime_ms, node, arch }` (NEW — proves the process is alive, not just the image)

### neolog-process-upload (Workflow Worker)
```
[workflows]    PROCESS_UPLOAD_WORKFLOW → ProcessUploadWorkflow
[d1]           DB              → neolog
[r2]           VIDEOS          → neolog-videos
[ai]           AI              → Workers AI
[service]      FFMPEG          → neolog-ffmpeg
[var]          CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME
[secrets]      R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, ANTHROPIC_API_KEY
```

### neolog-healer (Cron Worker)
```
[triggers]     crons = ["*/5 * * * *"]
[d1]           DB             → neolog
[service]      PROCESS_UPLOAD → neolog-process-upload
```

---

## 9. API endpoints (every route)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v2/upload/initiate` | Begin multipart upload, return presigned PUT URLs |
| POST | `/api/v2/upload/complete` | Finalize multipart |
| POST | `/api/v2/upload/audio-chunk-presign` | Presign a WAV chunk PUT (upload-time) |
| GET | `/api/v2/vlogs` | List vlogs |
| POST | `/api/v2/vlogs` | Register a new vlog row, dispatch workflow |
| POST | `/api/v2/vlogs/duplicate-check` | Filename + size dedupe |
| GET | `/api/v2/vlogs/[id]` | Vlog detail with presigned playback URL + threads |
| POST | `/api/v2/vlogs/[id]/process` | Re-run workflow with tier + passes |
| PUT | `/api/v2/vlogs/[id]/thumbnail` | Set browser-captured thumbnail |
| POST | `/api/v2/vlogs/[id]/audio-chunk-presign` | Presign a WAV chunk PUT (backfill) |
| PUT | `/api/v2/vlogs/[id]/audio-chunks` | Save audio-chunks manifest + re-dispatch workflow |
| GET | `/api/v2/vlogs/[id]/events` | Untruncated pipeline_events log for one vlog |
| GET | `/api/v2/timeline` | Heterogeneous feed (vlogs+threads+clips+posts+surfaced_cards) |
| GET | `/api/v2/threads/recent` | Recent threads |
| GET | `/api/v2/threads/[id]` | Thread detail |
| GET | `/api/v2/clips/[id]` | Clip detail |
| GET | `/api/v2/clusters` | Cluster list |
| GET | `/api/v2/clusters/[id]` | Cluster detail |
| GET | `/api/v2/projects` | Project list |
| GET | `/api/v2/projects/[id]` | Project detail |
| GET | `/api/v2/library` | Library entries |
| GET | `/api/v2/graph/stats` | Counts for graph view |
| POST | `/api/v2/chat` | AI assistant turn (tool-use loop) |
| POST | `/api/v2/chat/attachment` | Upload to a chat thread |
| GET | `/api/v2/settings` | Operator settings |
| PUT | `/api/v2/settings` | Update settings |
| GET | `/api/v2/system/status` | Aggregate health (D1 + R2 + FFmpeg + AI + healer + workflow) |
| GET | `/api/v2/system/ffmpeg-status` | FFmpeg-only status (legacy) |
| POST | `/api/v2/admin/run-migrations` | Manual migration force-run (auto-runs on cold start now) |
| POST | `/api/v2/admin/regenerate-thumbnails` | Reset stuck transcoding rows |
| POST | `/api/v2/admin/fix-thumbnails-batch` | Server-side batch thumbnail extract |
| POST | `/api/v2/admin/import-r2` | Scan R2 for orphan vlogs |
| POST | `/api/v2/admin/import-supabase-thumbnails` | Legacy Supabase thumb recovery |
| POST | `/api/v2/admin/backfill-recorded-at` | mvhd-based date backfill |

---

## 10. UI pages

| Path | What it shows |
|---|---|
| `/timeline` | Single chronological feed of cards (Vlog, Thread, Post, Clip, Article, B-roll, Attachment, Surfaced) |
| `/timeline/[id]` | Vlog detail: playback, transcript, threads, clips, **PIPELINE STATUS BLOCK** (each step as ✓ or ✗ or ⋯), re-extract tier picker, raw workflow log, auto-heal notice |
| `/studio` | Cluster cards (forming/ripening/ready/produced) |
| `/chat` | AI assistant with model picker (Scout/Kimi/Claude), threads sidebar |
| `/graph` | Visual graph: clusters as large nodes, threads as small, entities as dots |
| `/projects` | Long-form productions (state + headline + last_touched) |
| `/settings` | Operator profile, model defaults, API keys, stats |
| `/system` | NEW — health dashboard, hits every dependency, shows ✓/✗ with full error text |
| `/uploads` | Raw archive grid (313 vlogs), admin batches: Import from R2 / Extract thumbnails (browser) / Extract audio (browser, backfill) / Backfill recorded dates / Pull from Supabase |
| `/capture` | Drop-zone for new uploads + browser-side audio + thumb extract |
| `/thread/[id]`, `/clip/[id]`, `/cluster/[id]`, `/article/[id]`, `/attachment/[id]`, `/broll/[id]`, `/materialize/[id]` | Per-record detail pages |

---

## 11. Known issues / state of the world (2026-05-18)

### Just fixed
- **FFmpeg container was wedged due to a syntax error in `workers/ffmpeg/server.js` (stray `}` on what was line 342).** `node --check` confirmed the failure. Fix shipped in commit `3947484` along with `uncaughtException` handlers + `/boot-info` endpoint + `node --check` in `deploy-workers.yml`.

### Working (verified before the container broke)
- Multipart upload to R2 via presigned URLs
- Browser thumbnail capture
- Browser audio extract (small to medium files; struggles on >500MB)
- Schema migrations auto-applied per Worker isolate
- Auto-healing cron sweeps stuck rows every 5 min
- Workers AI Whisper transcription (when audio passes through correctly)
- All four extraction passes (threads, clips, creative, entities)
- Chat assistant with tool use

### Currently fragile or unproven
- **Pipeline UI on `/timeline/[id]`** shows step ticks but NOT real-time progress within a step. "Video transcode · FFmpeg" doesn't say "downloading 372 MB from R2…", "running ffmpeg -c:v libx264…", or "writing 84 MB to R2." Operator can't tell what's actually happening. **`pipeline_events` table now exists to support this UI but the renderer doesn't yet stream sub-step detail.** This is the next obvious work item.
- Browser audio extract for files >800 MB OOM-risks on Chrome/Edge — `decodeAudioData` loads the whole audio buffer into RAM (~1.3 GB/hr of PCM)
- The 13-step Workflow has many independent failure points; observability via `pipeline_events` is in place but the consolidated UI still needs to be built
- Workers AI Whisper request size limit — passing `Array.from(Uint8Array)` for the audio JSON-serializes to ~3x the byte count. Switched to passing `Uint8Array` directly which the binding binary-streams

### Patches we shipped that may not be needed anymore (now that container works)
- Browser-side audio chunked extraction (Phase 1a) — keep as defense-in-depth fallback, but the original `FFmpeg /extract-audio → MP3 → Whisper` path is faster and uses less browser memory
- `Extract audio in browser` button on `/uploads` — useful for backfilling old vlogs whose transcribe failed, but not strictly necessary going forward
- `audio_chunks_json` column on vlogs — populated by the browser path, read by the workflow transcribe step

### What we explicitly ruled out (do not reintroduce)
- Supabase, Inngest, Replicate, Groq, OpenAI fallback, ElevenLabs, fal.ai, AssemblyAI (constraint: Cloudflare-first)
- Caption/subtitle overlays on video output (CLAUDE.md hard rule)
- Bulk re-extraction of old vlogs (per-vlog opt-in only)
- Camera-on production paths (future product)
- Tier picker UI in initial scope (Lo-Fi only; tier picker exists for re-extract but not for new uploads)

---

## 12. Locked architectural decisions (from CLAUDE.md)

1. **Thumbnail cascade is fast-first** — `/extract-thumb` runs BEFORE `/transcode-h264`, not after. Three-tier cascade: direct → mini-transcode → post-transcode retry.
2. **Recorded-at 4-tier fallback** — pre_extracted → mvhd → filename → upload_time. Runs synchronously in the register API.
3. **softStep wrapper** — every workflow step is independent; one failure doesn't abort the rest.
4. **Pages bindings via REST API** — `@cloudflare/next-on-pages` doesn't read `[[d1_databases]]` etc from `wrangler.toml`; bootstrap workflow sets them via Cloudflare API.
5. **Voice preservation hard rule** — every thread's `take` and at least one `key_quote` must contain a verbatim 4+ word substring from the source transcript. Failed rows logged and SKIPPED (not written).
6. **Per-pass re-extract** — operator can re-run just one of the four passes without paying for the others.
7. **No captions on video output** — ever. Audio carries narration.
8. **All extraction prompts loaded from `prompts` table** by `(name, is_active=true)`. Every output row carries `extraction_prompt_version`.

---

## 13. What I'd hand to another coding agent right now

If asked "fix what's wrong with this app," start here:

1. **Verify the FFmpeg container is actually up.** `https://neolog.ai/system` should show ✓ FFmpeg with build `rebuild-2026-05-18-brace-fix-boot-guards` and `/boot-info` returning a uptime. If still ✗, look at the GitHub Actions log for the failing step.

2. **Make the pipeline UI tell the operator what's happening in real time.** `/timeline/[id]` should:
   - Stream `pipeline_events` rows for this vlog (poll `/api/v2/vlogs/[id]/events` every 1-2s while pipeline_status ∈ {transcoding, transcribing, extracting})
   - Render each step's `started_at`, `duration_ms`, `error_full_text` UNTRUNCATED
   - Show sub-step detail from `detail_json` (e.g., "Downloading chunk 3/5 from R2 — 4.2 MB / 5.4 MB")
   - When a step fails, show the full error message inline (no `...truncated` ellipsis)

3. **Collapse the 13-step workflow into 2 paths** (Plan section C):
   - Path 1: synchronous fast pipeline in the Pages POST route (register → audio + thumb in parallel → return)
   - Path 2: background extractions only (4 LLM passes, in parallel)
   - Drop transcode/recorded_at as workflow steps; they happen in Path 1
   - Healer cron then only watches 4 step types instead of 13

4. **Retire browser-side audio extract as primary**. Keep it as fallback. The container `extract-audio → MP3 → Whisper` path is faster, uses less browser memory, and now works again.

5. **Add CI for `pnpm exec tsc --noEmit` on every PR** (currently in `typecheck.yml.disabled` or similar — check it's enabled).

---

## 14. Quick-reference commands

```bash
# Typecheck the whole repo
pnpm exec tsc --noEmit

# Typecheck individual workers
cd workers/process-upload && pnpm exec tsc --noEmit
cd workers/healer && pnpm exec tsc --noEmit

# Syntax-check the container's Node server.js
node --check workers/ffmpeg/server.js

# Build + smoke test the container locally (what CI does pre-deploy)
cd workers/ffmpeg
docker build -t neolog-ffmpeg-test .
docker run -d --name ff-smoke -p 18080:8080 neolog-ffmpeg-test
curl -fsS http://localhost:18080/health
curl -fsS http://localhost:18080/boot-info
docker stop ff-smoke && docker rm ff-smoke

# Inspect what a vlog has actually done (use a vlog id from /uploads)
curl -fsS https://neolog.ai/api/v2/vlogs/01KRW7ES3G18A0Q6KV7SVPAJJS | jq .
curl -fsS https://neolog.ai/api/v2/vlogs/01KRW7ES3G18A0Q6KV7SVPAJJS/events | jq .

# Force a re-process from the UI's side
curl -X POST https://neolog.ai/api/v2/vlogs/01KRW7ES3G18A0Q6KV7SVPAJJS/process \
     -H 'Content-Type: application/json' \
     -d '{"tier":"free","passes":["threads"]}'

# Check system health
curl -fsS https://neolog.ai/api/v2/system/status | jq .
```

---

## 15. Critical recent commits

| SHA | Title | What changed |
|---|---|---|
| `3947484` | Fix wedged FFmpeg container + harden deploy + pipeline observability | Brace fix, boot guards, `/boot-info`, `node --check` in CI, Docker smoke test, `pipeline_events` table + `pipeline-events.ts` lib + `/events` API + `/system` page |
| `8dd9f92` | Phases 1b + 4 + 5 | Browser audio backfill, healer cron worker, UI cleanup |
| `785cbcd` | Phase 1a | Browser-side audio extraction at upload time |
| `3d55cf2` | Phase 2 | Auto-apply D1 migrations on Worker cold-start |

---

This file is the entire mental model of the system. Any agent picking up work should read it top-to-bottom first.
