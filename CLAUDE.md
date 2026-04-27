# Neolog

## What it is

A life log and content production system. You record yourself talking — brain dumps, vlogs, voice notes — and Neolog turns that into:
- A permanent searchable record of your thinking
- An accumulating intelligence layer (entities, ideas, patterns, energy)
- Edited video cut from your best moments
- Scripts written from your content, recorded in chunks with a teleprompter system
- Social posts surfaced automatically

Open to users. Not just a personal tool.

The legacy writing platform layer (posts, publications, newsletters, ActivityPub) exists in the codebase. Do not build in it, do not delete it.

---

## What's working right now

**Upload pipeline** — multipart upload → Inngest: extract audio (Replicate FFmpeg) → transcribe (Whisper) → analyze (Claude claude-sonnet-4-6) → extract entities → create post candidates → populate marinating ideas

**Intelligence layer (Brain)** — 6-region view at `/dashboard/brain`: Memory, Executive, Emotional, Pattern, Marinating, Conflict. Entities accumulate across sessions. Synthesize Graph button triggers cross-session synthesis. Entity detail pages at `/dashboard/entities/[id]`.

**Studio pipeline** — sessions → debrief → style → script → record (teleprompter, beat by beat) → produce → review. Full pipeline: script via Claude (`produce-studio-video.ts`) → operator records each beat (`RecordScreen.tsx`) → audio assembled via Replicate FFmpeg (`assemble-studio-audio.ts`) → Flux image per segment (`generate-segment-visuals.ts`) → images + audio composited to MP4 (`compose-studio-video.ts`).

**Posts** — post candidates auto-created from analysis (quotes, opinions, observations). X publishing wired at `/api/posts/publish`. Requires X OAuth connected in Settings.

**Videos page** — library, reanalyze on hover, live processing status polling.

**Settings** — API keys (Anthropic, OpenAI, Replicate, ElevenLabs), X OAuth, R2 storage, profile.

**Homepage** — public landing page with terminal animation, product sections, amber aesthetic.

---

## What we're building next

### 1. Auto-edit from vlogs ✅ (built — `/dashboard/edit`)
AI selects best transcript moments → Replicate FFmpeg assembles the MP4. Claude picks timestamps, user reviews plan, then assembles.

### 2. Teleprompter / chunk recording + visual production ✅ (built)
Script → operator records each beat → audio stitched → Flux images per segment → composited to MP4.
Full production pipeline status flow: `queued → running → scripted → assembling → generating-visuals → composing → done`

### 3. Production quality tiers

Current implementation is lo-fi: Flux Schnell still images + FFmpeg composition. Next tiers to build:

| Tier | Visuals | What needs building |
|------|---------|---------------------|
| **Lo-fi** ✅ | Flux Schnell stills + static frames | Done |
| **Mid** | Flux images + short Kling clip on key segments | Kling API integration per segment |
| **Hi-fi** | Full Kling/Runway video per segment | Per-segment video gen + longer timeouts |

Cost estimate before commit: `productions.estimated_cost_cents` + `productions.user_approved_cost` in DB schema, not yet wired in UI.
Tier picker UI not yet built — currently always runs lo-fi path.

---

## What is NOT a priority

- Character / Avatar / LoRA training — files exist, do not build further, not in nav
- Voice clone — Inngest stub exists, do not build further
- HeyGen / Synthesia — API routes exist, do not build further
- Legacy writing platform — exists, do not touch

---

## Codebase structure

```
src/
  app/
    (auth)/                  — login, signup, reset password
    (dashboard)/
      layout.tsx             — sidebar nav, auth guard
      dashboard/
        page.tsx             — home: key_win hero, stats, recent sessions, posts
        videos/              — video library + upload + reanalyze
        timeline/            — continuous transcript view + search
        timeline/[id]/       — session detail
        posts/               — social queue + X publish
        studio/              — production pipeline (PRIMARY)
        brain/               — 6-region intelligence view
        entities/            — redirects to brain
        entities/[id]/       — entity detail: mentions, context, related
        settings/            — API keys, profile, storage
        system/              — API health check
        character/           — portrait corpus (deprioritized, not in main nav)
    api/
      debrief/               — streaming Claude debrief chat
      studio/produce/        — creates script + production, fires Inngest
      studio/production-status/ — polls status + returns script segments
      posts/publish/         — publishes post_candidate to X
      video-upload/          — upload registration, list, reanalyze, thumbnails
      synthesize-graph/      — triggers synthesize-user-graph Inngest
      social/x/              — X OAuth + publish
      entities/              — entity CRUD + graph
  inngest/
    functions/
      process-upload.ts         — main pipeline
      produce-studio-video.ts   — script generation via Claude
      synthesize-user-graph.ts  — cross-session intelligence synthesis
      assemble-clip.ts          — FFmpeg video assembly (used for auto-edit)
      [others]                  — legacy, don't touch
  lib/
    video-analysis.ts    — AI analysis prompt + entity extraction
    ai-provider.ts       — resolves per-user API keys
    supabase/            — client, server, admin clients
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router |
| Runtime | Cloudflare Edge — `export const runtime = 'edge'` on every route + page |
| Hosting | Vercel |
| Database | Supabase (Postgres + RLS) |
| Storage | Supabase Storage (videos) + Cloudflare R2 |
| Uploads | Multipart direct to R2 via presigned URLs |
| Async jobs | Inngest |
| Transcription | OpenAI Whisper (whisper-1) |
| AI | Claude claude-sonnet-4-6 — use this for everything new |
| Video processing | Replicate FFmpeg (fofr/toolkit) |
| Auth | Supabase Auth |
| Styling | Inline styles with `C` color object — no Tailwind, no CSS variables |

---

## Design system

Dark amber terminal aesthetic. Every page uses this exact `C` object:

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

- Font: `'JetBrains Mono', monospace` everywhere
- Headlines: `'Syne', sans-serif` fontWeight 700–800
- Labels: `fontSize: 9, letterSpacing: 3, textTransform: 'uppercase'`
- Active nav: `borderLeft: '2px solid amber'` + `amberGlow` background
- Never use Tailwind or CSS variables

---

## Key env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
REPLICATE_API_TOKEN       — audio extraction + video assembly
X_CLIENT_ID               — X OAuth
X_CLIENT_SECRET
```

Users supply Anthropic/OpenAI/ElevenLabs/Replicate keys via Settings → API. Resolved per-user at runtime.

---

## Database — key tables

| Table | Purpose |
|---|---|
| `video_uploads` | Every upload + transcript + analysis JSON |
| `entities` | Accumulated concepts (projects, people, goals, ideas) |
| `entity_mentions` | Each time an entity appears in a specific upload |
| `style_cards` | Visual identity cards |
| `idea_cards` | Content ideas from debrief |
| `marinating_ideas` | Ideas accumulating across sessions |
| `scripts` | Generated script JSON (segments: narration + visual_direction + duration) |
| `productions` | Video production tracking (queued/running/done/error) |
| `post_candidates` | Social posts ready for review |
| `integration_keys` | Per-user API keys |
| `social_integrations` | X OAuth tokens |
| `profiles` | User profiles |
| `posts` | Legacy — do not remove |
| `publications` | Legacy — do not remove |

---

## Rules for Claude

- **Always update this document** when a feature is built, a decision is made, or priorities change. Do it in the same commit.
- Use `claude-sonnet-4-6` for all new AI features
- `export const runtime = 'edge'` on every route and page — non-negotiable
- Never hardcode API keys — always resolve per-user via `lib/ai-provider.ts`
- Never use Tailwind or CSS variables — inline styles with `C` object only
- Never route file uploads through API routes (Vercel 4.5MB limit)
- The `_archived/` directories exist — do not link them in nav, do not delete them

## ⚠️ NO CAPTIONS OR TEXT OVERLAYS — ever

These are documentary / short film / video essay productions. **Never add captions, subtitles, or text overlays to video output.** No burned-in text, no SRT files, no caption tracks, no lower thirds. The visual track is purely cinematic — images, motion, cuts. The audio carries the narration. Do not propose or build caption features.

---

## ⚠️ DO NOT CHANGE — Thumbnail pipeline

`fofr/toolkit` on Replicate accepts only `task`, `input_file`, `fps`. No `ffmpeg_command`.

`transcode-playback` runs **before** `extract-thumbnail` in `process-upload.ts`. This is intentional — DJI Mimo HEVC vertical videos have rotation metadata that causes frame extraction to return 0 frames. Transcoding to H.264 first strips it. Do not swap these steps.

Thumbnails stored as `data:image/jpeg;base64,...` directly in `video_uploads.thumbnail_url` — bypasses signed URL expiry.
