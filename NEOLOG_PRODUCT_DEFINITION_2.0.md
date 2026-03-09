# Neolog 2.0: Personal Intelligence Engine

## 1. The Core Revelation (The Pivot)

Neolog is no longer just a publishing platform or a CMS. It has pivoted to become a **Personal Intelligence System**—an extension of your mind, a "liquid CMS," and a living ledger of your life. 

Instead of sitting in front of a blank text editor trying to construct an essay, the workflow is flipped:
You do a raw, unedited brain dump into a microphone or camera. Neolog ingests that sprawling, unstructured footage and acts as a content refinery. It transcribes, analyzes, categorizes, and weaves your scattered thoughts into a structured **Knowledge Graph (a "git for your mind")**.

It's the ultimate tool for people who think faster than they write, have too many ideas to organize manually, and create high-value thoughts but abhor the friction of publishing and editing.

## 2. The Tech Stack & Architecture

- **Frontend:** Next.js (App Router), Tailwind CSS
- **Database & Auth:** Supabase (Postgres with `pgvector` for semantic search, RLS)
- **Large File Storage:** Supabase Storage (via TUS resumable uploads for multi-GB files), eventually moving to Cloudflare R2 for zero-egress scale
- **Asynchronous Processing:** Inngest (Reliable, step-based workflows avoiding Vercel timeouts)
- **Transcription:** OpenAI Whisper (chunked <25MB requests)
- **Analysis:** BYOK (Bring Your Own Key) Claude (Opus/Sonnet) or GPT-4o
- **Video Manipulation:** Replicate FFmpeg (for audio extraction and clipping)

## 3. The End-to-End Pipeline

1. **Raw Ingest (Upload):** Drop a multi-GB video or audio file into the web app.
2. **Audio Extraction:** Replicate strips the audio from the video, shrinking gigabytes down to megabytes.
3. **Transcription:** Whisper transcribes the audio, tracking exact timestamps for every word.
4. **Deep Synthesis (Analysis):** The LLM reviews the entire transcript and extracts structured data (ideas, concepts, people, blockers). PII (Personal Identifiable Information) like credit card numbers or SSNs is automatically scrubbed.
5. **Entity Accumulation:** The newly extracted data is federated into the `entities` table, updating the cross-session Knowledge Graph.
6. **Delivery & Assembly (VNext):** Neolog generates suggested posts and can use AI clip synthesis to stitch together the best quotes across multiple raw videos into coherent narrative clips via FFmpeg.
7. **Cleanup:** Source media is (optionally) deleted to save space after permanent intelligence is derived.

## 4. The Cross-Session Intelligence Model

The truest value of Neolog 2.0 comes from **Cross-Session Accumulation**. It listens to you today, remembers what you said last week, and bridges the gaps.

Instead of simple categories, Neolog extracts across **Dimensions of Life**:

*   **Temporal Intelligence**: Recurring themes, contradictions across time, the evolution of an idea, unfinished thoughts.
*   **The Living Resume & Portfolio**: A dynamic, ever-updating record of your skills, achievements, and unique problem-solving capabilities (e.g., pivoting a YouTube downloader into an AI documentary maker).
*   **Autonomous Marketing & "Selling"**: Generating accurate, compelling descriptions of your work and your innovative edge, effectively "selling" you and your projects since you find it difficult to do manually.
*   **The Social Media Narrator**: Running your social media for you. It observes what you are doing (through your logs, code, and videos) and writes the social media posts *about* you, as an external observer. You don't describe what you're doing; the system describes it.
*   **People Graph**: Who you mention, relationship health, collaboration patterns, and who influences your thinking.
*   **Questions**: The unanswered "what ifs" asked to the void, tracked as first-class entities.
*   **Decisions & Reasoning**: A log of choices made, trade-offs weighed, and paths abandoned.
*   **Commitments & Accountability**: Promises to yourself, tracked for follow-through across weeks.
*   **Beliefs & Values**: Passions, frustrations, and subconscious principles articulated over time.
*   **Energy & Patterns**: Flow states versus friction, topics that drain versus excite, creative peaks.
*   **Knowledge & Learning**: Books, models, and skills actively being explored.
*   **Content Pipeline**: Readily generated article topics, thread ideas, and core stories.
*   **Habits & Routines**: Daily activities, health targets, and productivity observations.
*   **Financial Signals**: Business models, revenue ideas, and money friction.
*   **Blockers & Friction**: Recurring obstacles, time sinks, and failing systems.
*   **Meta-cognition**: Moments of self-awareness and pattern recognition.

## 5. Extrapolating the Bigger Picture (Inputs Beyond Video)

While video and audio dumps are the primary ingest method, Neolog is designed to ingest *any* artifacts of your daily output to extrapolate the full context of your ambition:

1. **Daily Notes & Idea Dumps:** Copy/pasting scratchpads and braindumps at the end of the day.
2. **Activity Logs & Code History:** Ingesting documentation, commit logs, or summaries of AI pair-programming sessions (like the output of building a project) to understand *how* you build things.
3. **The "Dot Connector":** Neolog's greatest strength isn't just storing this data; it's synthesizing it. It takes a raw video rant about a tool, a glued-in code snippet, and a past project tag, and connects the dots to form a comprehensive narrative of your technical innovation and direction.

## 6. The "Liquid CMS" / Chat-First Interface

Once the intelligence is gathered, the interaction medium is chat. You speak with a "Manager Agent" that has complete context of your life's ledger. 
- "What was that app idea I had last Tuesday?"
- "Draft a newsletter based on the project updates I mentioned this week."
- "Show me my follow-through on my fitness commitments this month."
- "Generate a portfolio description of my AI documentary maker project."

You can create, edit, and distribute posts—or autonomous marketing materials—entirely through this chat interface, turning your accumulated raw data into refined outward-facing material effortlessly.

## 7. What Needs to be Removed (Cruft)

To fully realize this vision, legacy "blogging platform" features from Neolog 1.0 (such as complex syndication networks, subscriber tiers, ActivityPub fediverse integrations, HTML imported newsletters, and monetization) should be cleanly stripped out or heavily deprioritized so the core intelligence engine can shine.
