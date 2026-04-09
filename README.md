# Neolog 2.0 (Personal Intelligence System)

**Neolog is a Neural Production Engine — a system that transforms raw life data into cinema-grade media.**

You talk into it—raw, unedited, messy—and it turns your sprawling thoughts into structured knowledge and automated content. Your projects, ideas, and patterns accumulate into an "Editorial Board" that suggests video essay topics and drafts weekly scripts in your voice.

## The Core Concept

Instead of sitting in front of a text editor, you bypass the friction of writing by recording videos or audio. Neolog handles the rest:
1. **Upload:** Drop large video or audio files directly into the platform.
2. **Process:** It extracts the audio and transcribes the file with extremely high accuracy using OpenAI Whisper.
3. **Analyze:** Using advanced LLMs (Claude or GPT-4o), it parses your transcript to extract Ideas, Projects, Decisions, Commitments, Questions, and more.
4. **Federate:** It adds these extracted pieces to your living Knowledge Graph, linking them across previous sessions to identify patterns, evolution, and contradictions.
5. **Interact:** You can chat with your accumulated knowledge through the AI interface.
6. **Publish:** (Optional) Neolog can synthesize these raw inputs into suggested posts, or trigger an editing pipeline (via FFmpeg) to stitch together narrative video clips for distribution.

## Technical Architecure

- **Frontend:** Next.js 15 (App Router)
- **Database:** Supabase (Postgres with `pgvector` for entities)
- **Storage:** Supabase Storage (via TUS resumable uploads to handle multi-GB files without Vercel limits)
- **Orchestration:** Inngest (Durable background jobs to handle long-running transcriptions)
- **AI Models:** Bring Your Own Key (OpenAI for Whisper transcription, Anthropic for deep Claude analysis)
- **Video Manipulation:** Replicate FFmpeg for server-side audio extraction and video clip assembly

## Getting Started

### 1. Requirements
Ensure you have API keys for:
- Supabase (URL and Service Role)
- Inngest (Event Key and Signing Key for the background workers)
- Replicate (API Token for video/audio extraction)
- OpenAI and/or Anthropic (Set by the user inside the application settings)

### 2. Setup
```bash
git clone https://github.com/yourusername/neolog.git
cd neolog
npm install
```

### 3. Database Migrations
Run the SQL files in `supabase/migrations/` in your Supabase SQL Editor. Critical files include:
- `add_video_uploads.sql`
- `add_entities.sql`
- `add_clip_sessions.sql`

### 4. Running Locally
```bash
# Start the Next.js frontend
npm run dev

# In a separate terminal, start the Inngest dev server
npx inngest-cli@latest dev
```
Open [http://localhost:3000](http://localhost:3000)

## Project Evolution: From v1.0 to Neural Production

**Neolog 1.0 (LEGACY)**: Originally built as an ActivityPub-federated blogging platform. This version has been completely decommissioned and all legacy social/distribution code has been purged.

**Neolog 2.0 (FOCUS CLEANUP)**: The current version recently underwent a consolidation phase. Underdeveloped prototypes for Finances, Health, and RPG-style features were removed to eliminate code bloat and focus 100% on the **Neural Production Engine**—transforming your raw multi-modal corpus into cinema-grade media and weekly scripts.
