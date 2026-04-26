# Neolog — Claude Code Context

## What this is

Neolog is a **life log and content production system** — an evolution of the vlog/blog concept. The core idea: you record yourself talking (brain dumps, voice notes, iPhone videos) and Neolog turns that raw footage into structured intelligence, publishable content, and eventually a produced video.

It's a log of your life and thinking — everything you feed it accumulates into an intelligent record of who you are, what you're working on, and what you think. Over time it builds a picture of your ideas, patterns, energy, projects, and blockers.

**The product is open to users**, not just a personal tool.

The flow:
1. **Record** — upload a video or voice note
2. **Process** — Whisper transcribes, Claude extracts ideas/entities/quotes/patterns
3. **Accumulate** — entities and ideas build up across sessions in the intelligence layer (Brain)
4. **Debrief** — streaming AI conversation to surface the best idea from a session
5. **Produce** — style card → Claude-written script → (eventually) video output
6. **Publish** — post candidates auto-surface, user refines and publishes to X

The codebase has a legacy writing platform layer (posts, publications, subscriptions, newsletters, ActivityPub). That code exists but is fully backgrounded. **Do not build in it, do not delete it.**

---

## Active product areas (build here)

### Studio — production pipeline (primary focus)
`/dashboard/studio` — multi-screen flow:
1. **Sessions** — pick a processed upload
2. **Debrief** — streaming Claude chat that surfaces ideas; user selects one
3. **Style** — choose saved style card or create new (register, palette, lens, mood) — saves to DB
4. **Script** — auto-fires produce API on mount, polls until Claude generates script segments, shows them for review
5. **Produce** — shows pipeline stages, polls production status
6. **Review** — loads real production + script data, shows segments, download when ready

API: `POST /api/studio/produce` → creates script + production rows, fires `studio/produce` Inngest event
API: `GET /api/studio/production-status?id=` → returns production status + script segments
Inngest: `produce-studio-video.ts` — loads context, calls Claude claude-sonnet-4-6, saves script JSON, marks done

DB tables: `style_cards`, `scripts`, `productions`, `idea_cards`, `marinating_ideas`, `debrief_messages`

### Video uploads + processing
- `/dashboard/videos` — library; browse, reanalyze (hover → REANALYZE button), delete
- Upload: multipart direct upload (R2 presigned URLs). Supports 4GB+ files.
- After upload: Inngest `process-upload.ts` pipeline:
  - Replicate FFmpeg extracts audio
  - Whisper transcribes
  - Claude claude-sonnet-4-6 analyzes (ideas, entities, quotes, themes, energy, blockers, etc.)
  - Entities upserted to `entities` table
  - Post candidates inserted to `post_candidates`
  - Recurring ideas written to `marinating_ideas`
- Reanalysis: `POST /api/video-upload/[id]/reanalyze` — re-runs analysis without re-uploading

### Brain (experimental)
- `/dashboard/brain` — 6-region intelligence view (also accessible at `/dashboard/entities`)
- Regions: Memory (log entries), Executive (projects + actions), Emotional (energy/mood sparkline), Pattern (recurring themes + top entities), Marinating (ideas accumulating across sessions), Conflict (blockers, questions, commitments)
- **Synthesize Graph** button in header triggers `synthesize-user-graph` Inngest function (needs 3+ processed uploads)
- Entity detail: `/dashboard/entities/[id]` — session mentions, context quotes, related entities

### Posts / social
- `/dashboard/posts` — post candidates surfaced from video analysis
- Source types: `quote`, `strong_opinion`, `observation`
- **POST TO X** button calls `POST /api/posts/publish` with `candidate_id + text + platform`
- Requires X OAuth connected via Settings → (social_integrations table)
- `POST /api/social/x/connect` → PKCE OAuth flow → `/api/social/x/callback`

### Timeline
- `/dashboard/timeline` — continuous transcript view across all uploads, full-text search

### Settings
`/dashboard/settings` — tabs: Profile, API, Voice, Storage, Danger
- API tab: Anthropic, OpenAI, AssemblyAI, Replicate, ElevenLabs keys (stored in `integration_keys`)
- Voice tab: corpus progress toward 180-min threshold, trigger voice clone (fires `manifest/voice-threshold-met` Inngest event) — **deprioritized, don't build further**
- Storage tab: Cloudflare R2 config

### System
- `/dashboard/system` — live Claude API health check (tests Haiku, Sonnet, Opus)

---

## What is NOT a priority right now

- **Character / Avatar / LoRA** — page exists at `/dashboard/character`, Inngest stubs exist (`trigger-lora-training.ts`, `trigger-voice-clone.ts`). Do not build further. Do not add to nav.
- **HeyGen / Synthesia** — API routes exist, do not build further
- **Legacy writing platform** — posts, publications, newsletters, ActivityPub. Do not build in it, do not delete it.
- **`/dashboard/sessions`** — legacy clip session synthesis, still works but not linked in nav

---

## Codebase structure

```
src/
  app/
    (auth)/              — login, signup, reset password
    (dashboard)/
      layout.tsx         — sidebar nav, auth guard
      dashboard/
        page.tsx         — home: key_win hero, stats, recent sessions, posts ready
        videos/          — video library + upload
        timeline/        — continuous transcript view
        timeline/[id]/   — session detail
        posts/           — social queue + X publish
        studio/          — production pipeline (PRIMARY)
        brain/           — 6-region intelligence view (experimental)
        entities/        — redirects to brain
        entities/[id]/   — entity detail page
        settings/        — API keys, voice, storage, danger
        system/          — API health check
        character/       — portrait corpus (deprioritized, keep but don't link prominently)
        _archived/       — do not link in nav
    api/
      debrief/           — streaming Claude debrief chat
      studio/produce/    — creates script+production, fires Inngest
      studio/production-status/ — polls production status + script
      posts/publish/     — publishes post_candidate to X
      video-upload/      — upload registration, list, reanalyze, thumbnails
      synthesize-graph/  — triggers synthesize-user-graph Inngest
      social/x/          — X OAuth connect + callback + publish
      entities/          — entity CRUD + graph
      voice/trigger-clone/ — fires voice clone Inngest (deprioritized)
      character/trigger-lora/ — fires LoRA Inngest (deprioritized)
  inngest/
    functions/
      process-upload.ts        — main pipeline (audio → transcribe → analyze → entities → posts → marinating)
      produce-studio-video.ts  — script generation via Claude
      synthesize-user-graph.ts — whole-graph intelligence synthesis
      trigger-voice-clone.ts   — ElevenLabs voice clone (deprioritized stub)
      trigger-lora-training.ts — LoRA training (deprioritized stub)
      [others]                 — legacy, don't touch
  lib/
    video-analysis.ts    — AI analysis prompt + entity extraction
    ai-provider.ts       — resolves per-user API keys
    supabase/            — client, server, admin clients
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Runtime | Cloudflare Edge (`export const runtime = 'edge'` on every route + page) |
| Hosting | Vercel |
| Database | Supabase (Postgres + RLS) |
| Storage | Supabase Storage (videos) + Cloudflare R2 (assets) |
| Upload | Multipart direct to R2 via presigned URLs |
| Async jobs | Inngest (durable, step-based) |
| Transcription | OpenAI Whisper (whisper-1) |
| AI | Claude claude-sonnet-4-6 (primary — debrief, script, analysis) · GPT-4o (fallback) |
| Video processing | Replicate FFmpeg toolkit (audio extraction) |
| Auth | Supabase Auth |
| Styling | Inline styles with `C` color object — no Tailwind, no CSS variables |

---

## Design system

Dark amber terminal aesthetic. All styling via inline styles with the `C` constants object:

```typescript
const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  blue:         '#4870A8',
  red:          '#8A4040',
}
```

Font: `'JetBrains Mono', monospace`. Headlines: `'Syne', sans-serif` fontWeight 700–800.
Labels: `fontSize: 9, letterSpacing: 3, textTransform: 'uppercase'`.
Active nav: `borderLeft: '2px solid amber'` + `amberGlow` background.
**Never use Tailwind classes or CSS variables.**

---

## Key env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
REPLICATE_API_TOKEN       ← audio extraction via fofr/toolkit
X_CLIENT_ID               ← X OAuth
X_CLIENT_SECRET
```

Users supply Anthropic/OpenAI/ElevenLabs/Replicate keys via Settings → API. Resolved per-user at runtime via `lib/ai-provider.ts`.

---

## Database — key tables

| Table | Purpose |
|---|---|
| `video_uploads` | Every upload + transcript + analysis JSON |
| `entities` | Accumulated concepts across sessions (projects, people, goals, ideas, etc.) |
| `entity_mentions` | Each time an entity appears in a specific upload |
| `style_cards` | Visual identity cards saved by user |
| `idea_cards` | Content ideas surfaced from debrief |
| `marinating_ideas` | Ideas accumulating across sessions (written by process-upload) |
| `scripts` | Generated script JSON (segments with narration + visual direction) |
| `productions` | Video production tracking (status: queued/running/done/error) |
| `post_candidates` | Social posts ready for review (source: quote/strong_opinion/observation) |
| `integration_keys` | Per-user API keys (Anthropic, OpenAI, ElevenLabs, Replicate) |
| `social_integrations` | X OAuth tokens |
| `profiles` | User profiles |
| `posts` | Legacy writing platform — do not remove |
| `publications` | Legacy — do not remove |

---

## What matters most right now

1. **Studio pipeline works end-to-end** — sessions → debrief (selects idea) → style → script (Claude generates, shows segments) → produce → review. The script generation Inngest function is wired. The video assembly step (`assemble-clip`) is not yet connected to the produce flow.

2. **Upload pipeline is solid** — multipart upload → Inngest processing → analysis → entities + posts surface. This is the core data flywheel.

3. **Posts surface and publish** — post_candidates auto-created from analysis. X publishing wired but requires OAuth connection in Settings.

4. **Brain accumulates** — entities, patterns, marinating ideas build up across sessions. Synthesize Graph enriches it.

---

## Things to know

- Vercel 4.5MB body limit — never route file uploads through API routes
- `export const runtime = 'edge'` required on every route and page
- User brings their own API keys — never hardcode or assume system keys exist
- The `_archived/` directories exist but are not linked in nav — leave them alone
- AI model to use: `claude-sonnet-4-6` for everything new

---

## ⚠️ DO NOT CHANGE — Thumbnail pipeline invariants

### `fofr/toolkit` on Replicate
Accepts **only** `task`, `input_file`, `fps`. Does NOT accept `ffmpeg_command`.

Tasks:
- `extract_video_audio_as_mp3` → single MP3 URL
- `convert_input_to_mp4` → single H.264 MP4 URL
- `extract_frames_from_input` → array of frame URLs

### Step order in `process-upload.ts`
`transcode-playback` runs **before** `extract-thumbnail`. DJI Mimo vertical HEVC videos have rotation metadata that causes `extract_frames_from_input` to return 0 frames. Transcoding to H.264 first strips the rotation metadata. Do not swap these steps.

### Thumbnail storage
Stored as `data:image/jpeg;base64,...` directly in `video_uploads.thumbnail_url`. Bypasses Supabase signed URL expiry. GET `/api/video-upload` skips signing for columns starting with `data:`.
