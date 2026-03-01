# Neolog — Claude Code Context

## What this is

Neolog is a **personal intelligence system** for capturing and synthesizing raw thought.

The core idea: the user records themselves talking — brain dumps, clip batches, voice notes — and Neolog turns that raw unedited content into structured intelligence. Transcription, AI analysis, entity tracking, pattern recognition across sessions, and eventually AI-edited video clips ready to publish.

It started as a Substack/Medium competitor (writing platform). That layer still exists in the codebase — posts, publications, subscriptions, newsletters — but the active focus has shifted to the **video/audio capture and synthesis pipeline**.

**The primary user is the builder/creator themselves, not a public audience.**

---

## Active product areas (build here)

### Video uploads + processing
- `/dashboard/uploads` — TUS resumable upload (direct browser → Supabase Storage, bypasses Vercel). Supports 4GB+ files.
- After upload: Inngest pipeline → Replicate FFmpeg extracts audio → Whisper transcribes → Claude/GPT-4o analyzes
- Analysis extracts: ideas, projects, action items, decisions, blockers, goals, people, quotes, themes, content ideas, mood, energy
- Entities (projects, people, goals, ideas, habits) accumulate across sessions in the `entities` table

### Clip sessions (AI synthesis)
- `/dashboard/sessions` — groups multiple uploads together
- `synthesize-session` Inngest function: cross-clip analysis → finds themes, narrative arcs, connections → generates edit decision lists (EDLs)
- `assemble-clip` Inngest function: cuts segments from source videos via Replicate FFmpeg → concatenates as hard cuts → produces finished MP4
- No transitions. Hard cuts only.

### Brain / entities
- `/dashboard/brain` — accumulated entities across all uploads. Projects, people, goals, ideas that get richer with each recording.

### Captures
- `/dashboard/captures` — quick text captures (separate from video, like a scratchpad)

### Dashboard (home)
- Chat interface with an AI "manager" that has context about the user's entities and uploads

---

## Codebase structure

```
src/
  app/
    (auth)/              — login, signup, reset password
    (dashboard)/
      dashboard/
        uploads/         — video upload + results
        sessions/        — clip session synthesis + assembly
        brain/           — entity browser
        captures/        — text capture
        workspace/       — writing workspace
        agents/          — agentic newsroom (older feature)
        settings/        — API keys, profile
      [username]/        — public profile pages
      write/             — post editor
      publications/      — publication management
      analytics/         — post analytics
      _archived/         — old features, ignore these
    api/
      video-upload/      — register TUS upload, list uploads
      clip-sessions/     — session CRUD, synthesize, assemble, download
      inngest/           — Inngest function endpoint
      entities/          — entity CRUD
      capture/           — text capture
      agent/             — AI agent endpoints
      activitypub/       — Fediverse/ActivityPub (older feature, lower priority)
  inngest/
    functions/
      process-upload.ts  — main video pipeline (extract audio → transcribe → analyze → entities)
      synthesize-session.ts — cross-clip synthesis → edit plans
      assemble-clip.ts   — FFmpeg video assembly via Replicate
  lib/
    video-analysis.ts    — AI analysis prompt + entity extraction
    audio-processing.ts  — chunking utilities for Whisper
    supabase/            — client, server, admin clients
    ai-provider.ts       — resolves OpenAI/Anthropic keys per user
  types/
    database.ts          — all TypeScript types
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Hosting | Vercel |
| Database | Supabase (Postgres + RLS) |
| Storage | Supabase Storage (videos bucket) |
| Upload | TUS resumable (tus-js-client, direct browser → Supabase) |
| Async jobs | Inngest (durable, step-based, retries) |
| Transcription | OpenAI Whisper (whisper-1) |
| AI analysis | Claude (claude-opus-4-6) or GPT-4o depending on user's keys |
| Video processing | Replicate FFmpeg (audio extraction + clip assembly) |
| Auth | Supabase Auth |
| Styling | Tailwind CSS + CSS variables (theme tokens in globals.css) |

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

Users supply their own OpenAI/Anthropic keys via Settings → API Keys. The system resolves these per-user at processing time.

---

## Database — key tables

| Table | Purpose |
|---|---|
| `video_uploads` | Every uploaded video/audio file + its transcript + analysis |
| `clip_sessions` | Groups of uploads for cross-clip synthesis + edit plans |
| `entities` | Accumulated concepts (projects, people, goals, ideas) across all uploads |
| `entity_mentions` | Each time an entity appears in a specific upload |
| `captures` | Quick text notes |
| `profiles` | User profiles |
| `posts` | Written posts (legacy writing platform) |
| `publications` | Publication/newsletter management (legacy) |

---

## Active branch

`claude/video-upload-analysis-kARDH` — all video/upload/session work lives here.

---

## What matters most right now

1. **Video upload pipeline** — must work for 4GB+ iPhone videos. TUS upload is implemented. Needs `REPLICATE_API_TOKEN` in env to activate audio extraction.
2. **Clip sessions** — the synthesis + assembly pipeline is built but untested end-to-end. Replicate model IDs may need updating (placeholder IDs used — verify against replicate.com).
3. **DB migration** — `supabase/migrations/add_clip_sessions.sql` needs to be run in Supabase before sessions work.
4. **The writing platform layer** (posts, publications, newsletters, ActivityPub) still exists but is not the current focus. Don't delete it but don't prioritize it.

---

## Things to know

- Vercel has a 4.5MB body size limit for serverless functions — never route file uploads through API routes
- Inngest functions run as Vercel serverless functions — same memory/time constraints per step, but steps chain durably
- The `_archived/` directories contain old features that were deprioritized — they exist but aren't linked in the nav
- CSS design tokens live in `globals.css` as CSS variables (`--bg-card`, `--text-primary`, `--accent`, etc.) — always use these, not hardcoded colors
- The user brings their own AI API keys. Never hardcode or assume system-level keys exist.
