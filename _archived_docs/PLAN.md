# Video Upload + AI Clip Synthesis — Implementation Plan

## Overview

Support multi-GB video uploads with AI-powered clip synthesis. User records raw clips (e.g. 24 x 3-min iPhone videos), uploads them as a batch. The system transcribes each, analyzes across all clips to find themes/narratives, then generates an edit decision list (EDL) that produces finished, hard-cut video clips — each telling a coherent story from the raw material.

---

## Phase 1: Large File Upload (TUS Resumable)

### Problem
Current upload goes through Vercel API route (`/api/video-upload/route.ts`) which buffers the entire file. Vercel has a 4.5MB body limit. A 4GB video can't even reach the code.

### Changes

**1a. Install `tus-js-client`**
- `npm install tus-js-client`

**1b. `src/app/(dashboard)/dashboard/uploads/page.tsx`**
- Replace `fetch('/api/video-upload', { body: formData })` with TUS upload
- Upload goes directly from browser → Supabase Storage (bypasses Vercel)
- TUS endpoint: `https://{projectId}.supabase.co/storage/v1/upload/resumable`
- 6MB chunks, auto-retry, pause/resume
- Real progress bar: percentage + bytes uploaded/total
- After upload completes → call `/api/video-upload` POST with metadata only
- Remove "up to 500MB" text, support multi-GB
- Support multiple file selection (batch upload)

**1c. `src/app/api/video-upload/route.ts` (POST handler)**
- No longer receives file data
- Receives JSON: `{ storage_path, file_name, file_size_bytes, mime_type }`
- Creates DB record in `video_uploads`
- Fires Inngest event `video-upload/process`
- Everything else (GET, etc.) stays the same

---

## Phase 2: Audio Extraction (Replicate FFmpeg)

### Problem
The Inngest function downloads the entire file from storage into serverless memory. A 4GB video will OOM. Also, sending raw video bytes to Whisper is wasteful — the video has ~30MB of actual audio.

### Changes

**2a. Install `replicate`**
- `npm install replicate`

**2b. `src/inngest/functions/process-upload.ts`**
- Add new step between `fetch-context` and `transcribe`: **`extract-audio`**
  - Generate a signed URL for the video in Supabase Storage (1hr expiry)
  - Call Replicate `fofr/toolkit` with: input video URL → output audio (m4a, mono, 16kHz)
  - Save extracted audio back to Supabase Storage at `{user_id}/audio/{timestamp}.m4a`
  - Store `audio_storage_path` in the step output
  - Cost: ~$0.001 per video
- Modify `transcribe` step:
  - Download the small audio file (~30-60MB) instead of the full video
  - Rest of chunking + Whisper logic stays the same

**2c. `src/lib/audio-processing.ts`**
- No changes needed — chunking operates on the audio buffer, which is now always audio-only

---

## Phase 3: Batch Sessions + Cross-Clip Synthesis

### Concept
A "session" groups multiple uploads together. The AI analyzes each clip individually, then runs a synthesis pass across all clips to find themes, narratives, and the best arrangement of content.

### Database Changes

**3a. New migration: `add_clip_sessions.sql`**

```sql
-- A session groups multiple video uploads for cross-clip analysis
create table if not exists clip_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,                              -- auto-generated or user-provided
  status text not null default 'collecting'
    check (status in ('collecting','processing','synthesized','error')),

  -- Cross-clip synthesis output
  synthesis jsonb,                         -- themes, narratives, connections found
  synthesis_model text,

  -- Generated edit plans
  edit_plans jsonb,                        -- array of edit decision lists (EDLs)

  -- Stats
  clip_count int not null default 0,
  total_duration_seconds numeric,

  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link uploads to sessions (an upload can belong to one session)
alter table video_uploads add column session_id uuid references clip_sessions(id) on delete set null;
create index if not exists idx_video_uploads_session on video_uploads(session_id);

-- RLS
alter table clip_sessions enable row level security;
create policy "Users can manage own clip sessions"
  on clip_sessions for all using (auth.uid() = user_id);
create policy "Service role full access to clip sessions"
  on clip_sessions for all using (auth.role() = 'service_role');
```

**3b. New type: `ClipSession`** in `src/types/database.ts`

```typescript
export type EditDecision = {
  source_upload_id: string       // which clip
  start: number                  // timestamp in seconds
  end: number                    // timestamp in seconds
  transcript_excerpt: string     // what's being said in this segment
}

export type EditPlan = {
  title: string                  // "The Case for Building in Public"
  narrative_summary: string      // what story this edit tells
  platform: 'short_form' | 'long_form' | 'general'
  target_duration_seconds: number
  segments: EditDecision[]       // ordered list of cuts, played back-to-back (hard cuts)
}

export type ClipSynthesis = {
  themes: string[]                        // major themes across all clips
  narrative_arcs: Array<{
    title: string
    description: string
    clips_involved: string[]              // upload IDs
    strength: number                      // 0-1, how strong this narrative is
  }>
  connections: Array<{
    from_clip: string                     // upload ID
    to_clip: string                       // upload ID
    connection: string                    // how they relate
  }>
  best_moments: Array<{
    upload_id: string
    start: number
    end: number
    reason: string                        // why this moment is strong
  }>
}

export type ClipSession = {
  id: string
  user_id: string
  title: string | null
  status: 'collecting' | 'processing' | 'synthesized' | 'error'
  synthesis: ClipSynthesis | null
  synthesis_model: string | null
  edit_plans: EditPlan[] | null
  clip_count: number
  total_duration_seconds: number | null
  error_message: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}
```

**3c. Upload UX changes** in `uploads/page.tsx`
- Add "session" concept to the upload flow
- User can create a new session or add to existing one
- After uploading clips, a "Synthesize" button triggers cross-clip analysis
- Each clip still processes individually (transcribe + analyze) as uploads come in
- Synthesis only runs when user triggers it (all clips should be processed first)

**3d. New API route: `/api/clip-sessions/route.ts`**
- POST: create a session
- GET: list sessions
- PATCH: update session (title, trigger synthesis)

**3e. New API route: `/api/clip-sessions/[id]/route.ts`**
- GET: session detail with all clips + synthesis results + edit plans
- DELETE: delete session (keeps uploads, just unlinks them)

**3f. New Inngest function: `synthesize-session.ts`**

Triggered when user hits "Synthesize" on a session with all clips processed.

Steps:
1. **gather-transcripts**: Fetch all uploads in the session with their transcripts + individual analyses
2. **synthesize**: Send all transcripts + analyses to Claude/GPT-4 with a prompt like:

   > You have {n} raw video clips from one person. Each clip's transcript and analysis is provided below. Your job:
   > 1. Identify the major themes and narrative arcs across all clips
   > 2. Find the best moments — clear explanations, strong opinions, compelling stories
   > 3. Find connections between clips — ideas that build on each other, recurring themes
   > 4. Generate EDIT PLANS: each plan is a sequence of hard cuts from specific clips (by timestamp) that, played back-to-back, tell a coherent story
   > 5. Generate multiple edit plans if the material supports multiple narratives
   > 6. For short-form (60-90s): pick the single strongest idea, trim tangents
   > 7. For long-form (5-15min): weave multiple clips into a full narrative
   > 8. Each segment should start and end at natural speech boundaries
   > 9. Remove tangents, repetition, filler — keep only what serves the narrative

3. **save-synthesis**: Store synthesis + edit plans in `clip_sessions`

**3g. New Inngest function: `assemble-clip.ts`**

Triggered when user approves an edit plan and wants the actual video assembled.

Steps:
1. **generate-ffmpeg-commands**: Convert the EDL into FFmpeg commands
   - For each segment: extract the clip from source video by timestamp
   - Concatenate all segments with hard cuts (no transitions)
   - Output as MP4
2. **execute-assembly**: Send FFmpeg commands to Replicate with the source video URLs
   - Multiple source videos → download each, cut segments, concat
   - This may need a more capable Replicate model or a Cloud Run service
3. **upload-result**: Upload assembled video to Supabase Storage
4. **notify**: Update session with assembled clip URL

---

## Phase 4: Session UI

**4a. New page: `src/app/(dashboard)/dashboard/sessions/page.tsx`**
- List all sessions with status, clip count, date
- Create new session
- Click to view session detail

**4b. New page: `src/app/(dashboard)/dashboard/sessions/[id]/page.tsx`**
- Show all clips in the session (thumbnails or file names)
- Individual clip analysis expandable
- "Synthesize" button (enabled when all clips are processed)
- After synthesis: show themes, narrative arcs, connections
- Show generated edit plans with:
  - Title + narrative summary
  - Visual timeline showing which clips are used and which segments
  - "Assemble Video" button to generate the actual cut
  - Download link when assembly is complete

---

## Execution Order

1. **Phase 1** (upload) — unblocks everything, needed immediately
2. **Phase 2** (audio extraction) — needed for large videos to process
3. **Phase 3** (batch sessions + synthesis) — the core new feature
4. **Phase 4** (session UI) — displays the results

Phases 1+2 can be built together. Phase 3 DB + types can be built alongside. Phase 4 depends on Phase 3 API routes being in place.

---

## New Dependencies
- `tus-js-client` — TUS resumable upload from browser
- `replicate` — FFmpeg audio extraction + video assembly

## Env Vars Needed
- `REPLICATE_API_TOKEN` — for FFmpeg operations
- `NEXT_PUBLIC_SUPABASE_PROJECT_ID` — for TUS upload endpoint (may already be derivable from existing SUPABASE_URL)
