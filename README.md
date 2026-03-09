# Neolog 2.0 (Personal Intelligence System)

**Neolog is a Personal Intelligence Engine — a living ledger of your mind.**

You talk into it—raw, unedited, messy—and it turns your sprawling thoughts into structured knowledge over time. Your projects, ideas, goals, people, and patterns accumulate automatically. It is a "liquid CMS" that ingests multimodal brain dumps and synthesizes them into manageable, trackable entities, allowing you to converse with your past thoughts or publish refined clips and insights effortlessly.

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

## The Origin (Neolog 1.0)
*Note: Neolog was originally built as an advanced publishing / blogging platform (a Substack alternative). The codebase still contains the legacy "Posts", "Publications", and "ActivityPub" routing logic. While functional, the primary focus and development velocity has pivoted entirely to the Personal Intelligence System (V2.0) outlined above. The old documentation for 1.0 has been moved to the `_archived_docs` directory.*
