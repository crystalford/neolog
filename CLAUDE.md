# Neolog — Claude Code Context

## What this is

Neolog is a **personal intelligence system** for capturing and synthesizing raw thought into publishable content.

The core idea: the user records themselves talking — brain dumps, voice notes, iPhone videos — and Neolog turns that unedited content into structured intelligence, then all the way to a finished, AI-produced video. Transcription → AI analysis → entity tracking → pattern recognition → script writing → production.

**The primary user is the builder/creator themselves, not a public audience.**

The codebase has a legacy writing platform layer (posts, publications, subscriptions, newsletters, ActivityPub). That code exists but is fully backgrounded. **Do not build in it, do not delete it.**

---

## Active product areas (build here)

### Studio — production pipeline (primary focus)
- `/dashboard/studio` — the main creation flow. Multi-screen pipeline:
  1. **Sessions** — pick a processed video upload to work from
  2. **Debrief** — streaming AI conversation that surfaces ideas from the recording
  3. **Style** — choose or create a style card (visual identity: register, palette, lighting, lens, mood)
  4. **Script** — AI-generated script with segments, based on selected idea card + style card
  5. **Produce** — trigger video assembly
  6. **Review** — watch and download the finished production
- DB tables: `idea_cards`, `marinating_ideas`, `debrief_messages`, `style_cards`, `scripts`, `productions`

### Video uploads + processing
- `/dashboard/videos` — video library; browse, trigger reanalysis
- Uploads happen at `/dashboard/uploads` — TUS resumable upload (direct browser → Supabase Storage, bypasses Vercel). Supports 4GB+ files.
- After upload: Inngest pipeline → Replicate FFmpeg extracts audio → Whisper transcribes → Claude/GPT-4o analyzes
- Analysis extracts: ideas, projects, action items, decisions, blockers, goals, people, quotes, themes, content ideas, mood, energy
- Entities (projects, people, goals, ideas) accumulate across sessions in the `entities` table

### Timeline
- `/dashboard/timeline` — continuous transcript view across all uploads, searchable

### Posts / social queue
- `/dashboard/posts` — social posts ready to publish (X/Twitter)
- Post candidates surface from video analysis; user can refine and publish
- DB table: `post_candidates`

### System
- `/dashboard/system` — live Claude API diagnostic (tests Haiku, Sonnet, Opus), system health

### Settings
- `/dashboard/settings` — API keys (Anthropic, OpenAI, Replicate, HeyGen, Synthesia), profile

---

## Codebase structure

```
src/
  app/
    (auth)/              — login, signup, reset password
    (dashboard)/
      layout.tsx         — sidebar nav (7 routes), auth guard, session count
      dashboard/
        page.tsx         — home: recent uploads, quick stats
        videos/          — video library browser
        uploads/         — TUS upload UI
        timeline/        — continuous transcript view
        timeline/[id]/   — session timeline detail
        posts/           — social queue
        studio/          — production pipeline (primary feature)
        system/          — API health check
        settings/        — API keys + profile
        sessions/        — clip session synthesis (legacy, still works)
        brain/           — entity graph browser
        entities/        — entity list
        log/             — text capture log
        character/       — character/persona management
        _archived/       — deprioritized features, do not link in nav
    api/
      video-upload/      — TUS registration, list, reanalyze, thumbnails
      clip-sessions/     — session CRUD, synthesize, assemble, download
      inngest/           — Inngest function endpoint
      entities/          — entity CRUD + graph
      capture/           — text capture
      social-queue/      — post candidates, refine, publish
      social/x/          — X OAuth + publish
      project-documents/ — project doc CRUD + synthesis
      assets/            — media asset CRUD + search
      storage/           — R2 signed URLs
      log-entries/       — text log CRUD
      transcript-words/  — transcript full-text search
      video/heygen/      — HeyGen avatar video generation
      video/synthesia/   — Synthesia video generation
      editorial/         — script generation
      inngest/           — Inngest endpoint
  inngest/
    functions/
      process-upload.ts       — main video pipeline (extract audio → transcribe → analyze → entities)
      synthesize-session.ts   — cross-clip synthesis → EDLs
      assemble-clip.ts        — FFmpeg video assembly via Replicate
      synthesize-project.ts   — per-project synthesis
      synthesize-user-graph.ts — whole-graph user intelligence
      process-capture.ts      — text capture analysis
      process-chat.ts         — chat session analysis
      develop-idea.ts         — idea development + content angles
      refine-signals.ts       — entity deduplication
      trigger-lora-training.ts — LoRA training stub
      trigger-voice-clone.ts  — voice clone via Replicate
  lib/
    video-analysis.ts    — AI analysis prompt + entity extraction (593 LOC)
    audio-processing.ts  — chunking utilities for Whisper
    ai-provider.ts       — resolves OpenAI/Anthropic/Replicate/HeyGen keys per user
    ai-assistant.ts      — dashboard chat interface
    storage/r2.ts        — Cloudflare R2 upload/download/presign
    embeddings.ts        — pgvector semantic search
    email/               — Resend email + templates
    supabase/            — client, server, admin clients
  types/
    database.ts          — all TypeScript types
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Runtime | Cloudflare Edge (`export const runtime = 'edge'` on all routes + pages) |
| Hosting | Vercel |
| Database | Supabase (Postgres + RLS) |
| Storage | Supabase Storage (videos) + Cloudflare R2 (assets) |
| Upload | TUS resumable (tus-js-client, direct browser → Supabase) |
| Async jobs | Inngest (durable, step-based, retries) |
| Transcription | OpenAI Whisper (whisper-1) |
| AI analysis | Claude (claude-sonnet-4-5/4-6) or GPT-4o depending on user's keys |
| Video processing | Replicate FFmpeg (audio extraction + clip assembly) |
| Auth | Supabase Auth |
| Styling | Inline styles using `C` color object (see Design System below) |

---

## Design system

The app uses a **dark amber terminal aesthetic**. All styling is done with inline styles using a `C` constants object — **not** Tailwind classes or CSS variables. Copy this pattern exactly when building new pages:

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

Font: `'JetBrains Mono', monospace` (monospace terminal feel throughout).  
Labels: `fontSize: 9, letterSpacing: 3, textTransform: 'uppercase'`.  
Active nav item: `borderLeft: '2px solid amber'` + `amberGlow` background.  
Do **not** use Tailwind classes or `globals.css` CSS variables for new pages.

---

## Key env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
REPLICATE_API_TOKEN          ← needed for audio extraction + video assembly
```

Users supply their own OpenAI/Anthropic keys via Settings → API Keys. The system resolves these per-user at processing time (`lib/ai-provider.ts`).

---

## Database — key tables

| Table | Purpose |
|---|---|
| `video_uploads` | Every uploaded video/audio file + its transcript + analysis JSON |
| `clip_sessions` | Groups of uploads for cross-clip synthesis + edit plans |
| `entities` | Accumulated concepts (projects, people, goals, ideas) across all uploads |
| `entity_mentions` | Each time an entity appears in a specific upload |
| `style_cards` | Visual identity cards (register, palette, lighting, lens, mood) per production |
| `idea_cards` | Content ideas surfaced from debrief conversations |
| `marinating_ideas` | Ideas not ready yet — accumulate across sessions until promoted |
| `debrief_messages` | Streaming debrief conversation history (role: user/assistant) |
| `scripts` | Versioned scripts with segment JSON, linked to idea_card + style_card |
| `productions` | Video output tracking (linked to script) |
| `post_candidates` | Social posts ready for review + publishing |
| `log_entries` | Text captures with analysis |
| `profiles` | User profiles |
| `posts` | Written posts (legacy writing platform — do not remove) |
| `publications` | Publication management (legacy — do not remove) |

---

## Git workflow

This is a solo personal project. **Push directly to `main`** — no feature branches, no PRs. Every push to main deploys to production automatically via Vercel.

---

## Roadmap (not started)

- **End-to-end Studio pipeline** — debrief → idea card → script → produce → review flow needs to be tested and hardened end-to-end. The DB schema and UI screens exist; the assembly step needs to wire up `assemble-clip` Inngest function triggered from the produce screen.
- **Image uploads for Character/Avatar** — upload photos of the user to `/dashboard/character`. Goal: corpus of portrait photos → LoRA training pipeline → hyper-realistic AI portraits. `trigger-lora-training` Inngest function exists as a stub.
- **Voice clone integration** — `trigger-voice-clone` Inngest function exists. Needs UI to trigger + status tracking.

---

## What matters most right now

1. **Studio pipeline end-to-end** — the multi-screen flow (sessions → debrief → style → script → produce → review) is the core product. The screens exist, the DB schema is in place, but the produce→assemble connection needs wiring and end-to-end testing.
2. **Video upload pipeline** — must work for 4GB+ iPhone videos. TUS upload is implemented. Needs `REPLICATE_API_TOKEN` in env to activate audio extraction.
3. **Post candidates / social queue** — `post_candidates` table is used by the posts page; verify the table exists and the `social-queue` API is routing correctly.
4. **The writing platform layer** (posts, publications, newsletters, ActivityPub) exists but is not the focus. Don't delete it, don't build in it.

---

## Things to know

- Vercel has a 4.5MB body size limit for serverless functions — never route file uploads through API routes
- Inngest functions run as Vercel serverless functions — same memory/time constraints per step, but steps chain durably
- The `_archived/` directories contain old features that were deprioritized — they exist but are not linked in the nav
- **Do not use Tailwind classes or CSS variables for new UI** — use inline styles with the `C` color object (see Design System above)
- The user brings their own AI API keys. Never hardcode or assume system-level keys exist.
- `export const runtime = 'edge'` is required on every route and page — the app runs on Cloudflare Edge
- AI models in use: `claude-sonnet-4-6` (chat, project synthesis), `claude-sonnet-4-5` (video analysis, idea development), `claude-opus-4-5` (session synthesis, user graph), `gpt-4o` (fallback when no Anthropic key)

---

## ⚠️ DO NOT CHANGE — Thumbnail pipeline invariants

These are intentional design decisions that took significant debugging to get right. **Do not "simplify" or revert them.**

### `fofr/toolkit` on Replicate — correct API
The model accepts **only** `task` (enum), `input_file`, and `fps`. It does **NOT** accept `ffmpeg_command`. Sending `ffmpeg_command` returns a 422 before creating a prediction — nothing appears in the Replicate dashboard and the step silently fails.

Correct tasks:
- `extract_video_audio_as_mp3` → returns single MP3 URL
- `convert_input_to_mp4` → returns single H.264 MP4 URL
- `extract_frames_from_input` → returns `List[Path]` = **array** of frame URLs (not a ZIP)

### Step order in `process-upload.ts`
`transcode-playback` (step 2c) runs **BEFORE** `extract-thumbnail` (step 2d). This is intentional.

**Why:** DJI Mimo vertical (9:16) HEVC videos have rotation metadata in their MOV/MP4 container. When `fofr/toolkit extract_frames_from_input` encounters this, it silently returns 0 frames. Transcoding to H.264 first via `convert_input_to_mp4` strips the rotation metadata and produces a file that frame extraction works on reliably. The `extract-thumbnail` step then uses `playbackStoragePath` (the H.264 output) as its primary input source.

**Do not swap these steps back** — it will break thumbnails for all vertical DJI videos.

### `generate-thumbnail.ts` — playback_path first
The function checks `upload.playback_path` first and uses the signed URL for that H.264 file as the input to `extract_frames_from_input`. Only if `playback_path` doesn't exist does it fall back to the original file. This is the same reason as above — original HEVC vertical files fail frame extraction.

Do not remove the `playback_path` check or simplify this to only use `storage_path`.

### Thumbnail storage format
Thumbnails are stored as `data:image/jpeg;base64,...` or `data:image/png;base64,...` data URLs directly in `video_uploads.thumbnail_url`. This bypasses the Supabase signed URL chain (which expires and requires re-signing). The GET `/api/video-upload` route skips signing for columns that start with `data:`.
