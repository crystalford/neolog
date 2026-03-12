# Neolog — System Vision & Architecture Principles

> Read this before writing any code. It overrides defaults.

---

## What This System Is

A life ingestion engine for a type of mind: high-output, multi-project, nonlinear. Best thinking happens in motion. The system is the interface — not the blank page.

**The system is multi-tenant by design. Every feature is built for a user, not for a specific user. The founder is user zero — the first person to run the full system against their own life. Nothing about the founder's specific projects, habits, or creative works should appear in code, prompts, or architecture. Those are data. The system is the container.**

Private depth is what makes the public surface trustworthy and interesting. The loop: ingest privately → synthesize → publish automatically. Without the public output layer the system is a private vault, which misses half the vision.

---

## The Full Stack (Five Layers, One Data Source)

This is not five products. It is one stack with five output modes. The same entity graph powers all of them.

**NeoMind** — the graph layer. The entity graph surfaced as a first-class interface. Not the timeline, not the sessions — the pure graph. Concepts, their relationships, their evolution, their contradictions. Navigable and queryable. The thing a user looks at and recognizes as how they actually think. This is the exocortex layer — an external model of the user's mind that can be inspected, corrected, and navigated. Everything else is downstream of this.

**NeoLog** — the raw capture layer. Lines, fragments, session captures. The unedited chronological record. Video, voice, text, chat, imports — all land here. The log is the input surface. It is also the public feed in its rawest form.

**NeoBlog** — the text synthesis layer. Living documents that grow automatically as the user talks about a topic. Draft blog posts, articles, project histories, screenplay scenes, autobiographical entries — all auto-initiated when the entity graph detects sufficient density around a theme. The moment a concept is mentioned for the second time, a draft opens. Every subsequent mention adds to it. The user never starts from blank — the document is always already in progress, assembled from what they have already said, waiting to be shaped rather than initiated. Two modes: written by the user (first person, their voice) and written about the user (third person, biographical). The system knows which mode it is in and uses different prompts accordingly.

**NeoVlog** — the video output layer. Reads from the same entity graph. The same upload that triggers NeoLog ingestion optionally triggers NeoVlog processing — one toggle per project in settings (not per upload — some projects are public, others are private research). The autonomous content pipeline: one video input produces a short-form edit with captions, a long-form documentary cut, a blog post from the transcript, and entity graph updates. One input, four outputs, zero editing. Generic AI video is commodity. Personalized AI video grounded in months of accumulated context — the system knows the user's voice, projects, recurring themes — is a different category.

**NeoFeed** — the distribution layer. Takes all outputs and routes them to the right platforms automatically. Blog post goes to the public log or connected publication. Short clip routes to X, TikTok, YouTube Shorts. Long video goes to YouTube. The living resume updates. The public profile reflects the new state. This is the layer that closes the loop from private ingestion to public presence without the user touching anything. Without NeoFeed, outputs exist inside the system but do not move. NeoFeed is the arrow to World at the end of the stack.

---

## What This System Actually Is (Technically)

Not an intelligent system yet. **Structured memory that an LLM reads before responding.**

Architecture: `accumulated data + Claude API = simulated persistent intelligence`

Claude is stateless — briefed from the database every call, not learning. The ceiling is retrieval quality and context construction. This is a personal RAG (retrieval-augmented generation) system built on life data.

**Version 1** (what is being built): structured capture → entity graph → RAG-based Claude sessions

**Version 2** (the breakthrough): fine-tune a small model on 12-18 months of accumulated sessions, entity corrections, and artifact feedback. That model does not need briefing. It knows the user the way a base model knows English. Two-tier architecture: fine-tuned model for pattern work and routine extraction, Claude API for heavy reasoning and synthesis.

Version 1 is simultaneously the product and the training data pipeline for Version 2. **Build with that in mind. Every entity correction is a label. Every artifact edit is a signal. Session quality matters.** The voice/style model also builds from Version 1 data — the system reads accepted artifact edits, corrections, the phrasing kept versus changed, and builds a style fingerprint over time. After enough signal it writes like the user, not just for them.

---

## Data Model Principles

### Polymorphic entity_mentions (non-negotiable)

Every entity mention links to exactly one source, identified by `source_type`:

| source_type | foreign key | used when |
|---|---|---|
| `video` | `video_upload_id` | processed video/audio upload |
| `chat` | `log_entry_id` | chat session archived |
| `capture` | `log_entry_id` | text/voice capture |
| `import` | `log_entry_id` | imported external content |

All inputs land as `log_entries` (except video, which uses `video_uploads`). Never create a separate extraction path that bypasses the entity graph.

### Unified timeline

All session types produce a `log_entry`. Every session is in the timeline.

### Entities accumulate, never reset

An entity's `mention_count`, `first_mentioned_at`, `last_mentioned_at`, and `summary` update with every new mention. The summary is regenerated by the synthesis job as more context accumulates — it is not a static first-impression snapshot. Store `first_summary` when entity is created. Store `current_summary` after each synthesis run. Drift is visible by diff.

### Framing is data

The *framing* of an entity (how the user is currently relating to a project, how they describe an idea) is captured as `context` on each `entity_mention`. Contradiction detection in Phase 4 diffs these framings over time. This is why context must be rich and specific, not generic.

---

## The Extraction Prompt Is the Intelligence

The Claude analysis prompt in `src/lib/video-analysis.ts` is not a detail. It is the intelligence layer. Every phase downstream is only as good as what it extracts.

The prompt versions itself: every analysis response includes `"analysis_version"` so we can track which prompt generated which data. When the prompt improves, historical data does not corrupt — it is tagged with its version.

Do not modify the extraction prompt casually. Test against real sessions first. The quality of the entity graph is entirely dependent on it.

---

## Phase Progression (What the System Knows After Each Phase)

| Phase | What the system knows |
|---|---|
| 0 | Sessions happened |
| 0.5 | Extracted entities are real (gating requirement — do not proceed past this) |
| 1 | The same concept appeared across multiple input types |
| 2 | The user can see their own history on any entity |
| 3 | Which entities are connected and how strongly |
| 4 | How thinking about something has changed over time |
| 5 | Where the user is right now — every time, not as a special case |
| 6 | Patterns the user did not consciously notice |
| 7 | The system can generate finished material from accumulated input |
| 8 | The system publishes curated output publicly and automatically |

---

## Phase Details

### Phase 0 — Verify the Foundation
Upload a short video → confirm `entities` and `entity_mentions` rows appear. Post a chat session → confirm `log_entries` + `entity_mentions(source_type='chat')`. Verify: `SELECT source_type, count(*) FROM entity_mentions GROUP BY source_type`.

### Phase 0.5 — Extraction Prompt as Gating Requirement
Run 5-10 real sessions through the prompt. Inspect raw entity output. Revise and retest. Done when type accuracy is above 90% and duplicate rate below 10% on manual review. **Do not proceed to Phase 1 until this passes.**

### Phase 1a — Text/Capture + Browser Voice
`/api/capture` → `log_entry(type='capture')` → Inngest → entity extraction → `entity_mentions(source_type='capture')`. Browser voice recording: MediaRecorder → Supabase Storage → same video pipeline. The frictionless primary input mode.

### Phase 1b — Import Pipeline
Test Claude and ChatGPT export formats manually before building UI. They have completely different JSON structures. All imports land as `log_entry(type='import')`.

### Phase 2 — Brain UI + Observability
Show all source types in mention timeline. Add `last_synthesized_at` to entities, visible in UI. If synthesis stops running, it must be immediately visible.

### Phase 2.5 — Entity Correction (Non-Negotiable for Version 2)
Thumbs up/down, merge duplicates, retype. All corrections stored with timestamps as training labels. Done when merge reroutes all mentions to canonical.

### Phase 3 — Entity Relationship Graph
New table: `entity_relationships(from_entity_id, to_entity_id, relationship_type, strength int, last_seen_at)`. Types: `co-occurs`, `involves`, `conflicts-with`. `upsertEntities()` upserts co-occurrence pairs per session.

### Phase 4 — Cross-Session Synthesis + Contradiction Detection
New Inngest function `synthesize-user-graph`. Detects drift/contradiction (diff on sequential framings), momentum, stall, unresolved questions. Also: **commitment tracking** — commitments extracted across sessions; when a commitment goes unresolved across multiple sessions it surfaces automatically. Updates `entities.summary`, `entities.status`, relationship strength, `last_synthesized_at`.

### Phase 5 — Dashboard as Synthesis Surface + Entity-Primed Chat
Not a re-entry feature. Not triggered by inactivity. Just what the home screen always is — every time, for every user. Active entities, unresolved questions, synthesis delta since last session. Entity-primed chat: the wow moment — inject entity graph into system prompt before every chat session so the system can push back with history.

### Phase 6 — Cross-Project Pattern Detection
Surface when a problem solved in one project applies to another. Thematic clustering across entities from different projects. Surface when the same underlying concern appears in multiple contexts without the user connecting them explicitly.

### Phase 7 — Artifact Generation + NeoBlog Living Documents
Explicit thresholds — no vague "sufficient density":
- Project history: 10+ mentions, 3+ session types, 30+ day span → auto-generate
- Biographical summary: 50+ entities, 20+ sessions, 60+ day span
- NeoBlog draft: 5+ co-occurring entities with 20+ co-occurrences → auto-initiate living document

**Living document behavior**: the moment a concept is mentioned for the second time, a draft opens. Every subsequent mention adds to it. The user shapes rather than initiates. Two voice modes per artifact: written by the user (first person) or written about the user (third person biographical). Set at the artifact level.

Artifacts stored, versioned, in `/dashboard/artifacts`. Edits and rejections are training signals for Version 2.

### Phase 8 — Public Output Layer + NeoVlog + NeoFeed
Public log, living resume at `/[username]`, platform integrations. NeoFeed routes outputs automatically: blog → publication, short clip → X/TikTok/YouTube Shorts, long video → YouTube. NeoVlog: one toggle per project triggers the autonomous content pipeline alongside standard ingestion. One video input → short-form edit + long-form cut + NeoBlog post + entity graph update.

---

## Key Files

| File | Phase |
|---|---|
| `src/inngest/functions/process-upload.ts` | Phase 0 |
| `src/lib/video-analysis.ts` (extraction prompt) | Phase 0.5 |
| `src/app/api/capture/route.ts` | Phase 1a |
| `src/inngest/functions/process-capture.ts` | Phase 1a |
| `src/app/api/import/route.ts` | Phase 1b (new) |
| `src/app/(dashboard)/dashboard/brain/page.tsx` | Phase 2, 2.5 |
| `supabase/migrations/` | Phase 3 (`entity_relationships`), Phase 7 (`artifacts`) |
| `src/inngest/functions/synthesize-user-graph.ts` | Phase 4 (new) |
| `src/app/(dashboard)/dashboard/page.tsx` | Phase 5 |
| `src/app/[username]/` | Phase 8 (extend existing) |

---

## What Not To Build Until Its Phase

- UI polish before data layer is verified
- Meta-synthesis before basic entity extraction is confirmed cross-source
- Entity relationship graph before polymorphic mentions work across all source types
- Artifact generation before cross-session synthesis exists
- NeoVlog pipeline before entity graph is populated and reliable
- NeoFeed integrations before there are artifacts worth distributing
- Any feature whose primary value is visual rather than structural

---

## Verification Principle

Every phase must be verifiable by querying raw DB rows — not by looking at UI changes. If you cannot confirm it worked via `SELECT`, it is not done.

---

## The Honest Constraint

This is Version 1. Claude API is stateless — briefed from the database every call, not learning. The ceiling is retrieval quality and context construction. Version 2 (fine-tuned personal model) is 12-18 months of consistent use away. Build Version 1 so every design decision produces clean training data: corrections are labels, artifact edits are signals, session quality matters. The version 1 you are building is simultaneously the product and the dataset.

---

## The Long Arc

The logical endpoint of NeoMind → NeoLog → NeoBlog → NeoVlog → NeoFeed is interactive narrative. The entity graph is already a spatial structure, just rendered as a list. The user's creative history, projects, thinking — not just as text or video but as navigable space. Someone could move through a creator's intellectual history the way you walk through a museum or play a game. Version 4. The same data all the way down.
