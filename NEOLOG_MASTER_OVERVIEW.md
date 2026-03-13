# Neolog: The Personal Intelligence Engine (Master Overview)

## 1. Project Philosophy
**Neolog is an extension of the mind itself.**
It acts as a cognitive prosthetic that bypasses the friction of text-based logging. Instead of writing, you talk into it—raw, messy video/audio dumps—and Neolog transforms them into a structured, living ledger of your mind. It is a "Liquid CMS" that synthesizes raw inputs into manageable, trackable entities (Projects, Ideas, Skills, Health markers).

## 2. The Core Workflow
1. **Multimodal Ingest**: Upload large video/audio files (resumable TUS uploads).
2. **Metadata Extraction**: Extracts "Media Created" timestamps from binary headers (MP4/QuickTime) to ensure perfect timeline placement.
3. **Durable Pipeline**: Background processing via **Inngest** handles transcribing (Whisper), PII scrubbing, and deep AI analysis without timeouts.
4. **Entity Synthesis**: Extracting a 20+ dimension taxonomy (Actions, Decisions, Projects, People, Blockers) and linking them cross-session.
5. **RPG Representation**: Visualizing life data as "Character Stats" (XP, Levels, Attributes) and physical assets as "Inventory Loadouts."

## 3. Technical Stack
- **Framework**: Next.js 15 (App Router).
- **Backend / Database**: Supabase (Postgres + `pgvector` for semantic search).
- **Background Jobs**: Inngest (Durable functions).
- **AI Engine**: 
  - **Transcription**: OpenAI Whisper (via Replicate).
  - **Analysis**: Anthropic Claude (deep reasoning) / GPT-4o.
  - **Execution**: Replicate FFmpeg (for video clipping and audio extraction).
- **UI**: Vanilla CSS + Lucide Icons, focusing on a "Control Room" aesthetic (Dark mode, glassmorphism, high density).

## 4. Current Feature Set (Live V2.0)
- **Intelligence Timeline**: Chronological log of sessions with AI-generated "Perspectives."
- **Entity Knowledge Graph**: Automated tracking of Projects, Skills, and People mentioned across time.
- **Media Database**: Professional gallery for raw uploads with Grid/List modes and semantic sorting.
- **RPG Profile (Character Sheet)**: 
  - **Level/XP System**: Based on ingestion volume and intelligence depth.
  - **Bio-Map**: A humanoid heatmap that glows where you have health issues (extracted from logs).
  - **Skill Attributes**: Auto-ranking your mastered skills from session data.
- **Inventory & Assets**: Managing physical and digital gear (Cars, Gear, Hardware) with maintenance tracking.
- **Portfolio Engine**: Auto-generating professional summaries and project case studies from evidence.

## 5. Key API / Internal Logic
- **`recorded_at` Priority**: The system uses metadata extraction to prioritize the actual time of capture over the time of upload.
- **`LogCard` Logic**: Gracefully handles deleted source files by falling back to stored analysis snapshots.
- **Visual Intelligence**: Context-aware color coding for Projects (Blue), Blocks (Rose), Actions (Emerald), and Ideas (Amber).

## 6. How to Extend
- **New Entities**: Add to the `entities` table and update the prompts in `src/inngest/functions/process-upload.ts`.
- **New UI**: Maintain the "Premium/HUD" aesthetic using the CSS variables in `globals.css`.
- **New Workflows**: Use Inngest to trigger cross-session synthesis or external publishing (X/LinkedIn).
