# Neolog — handoff package

This package contains everything needed to upgrade the existing Neolog codebase to the architecture specified herein. It is a complete description of what Neolog is, what it does, what it produces, and how it is built.

The package is the substrate. Read it, interpret it, build from it.

---

## What is Neolog

Neolog is a personal life graph and creative production system. The operator records vlogs while driving and between deliveries; the system extracts threads, clusters them into developing positions, and materializes those positions into multiple output forms — video essays, articles, X posts and threads, video clips, and creative work like screenplays. The graph belongs to the operator, is exportable in full, and persists across the operator's life.

The graph is the artifact. The graph is the point. Everything else in this package describes tools that operate on the graph — capture, extraction, clustering, cultivation, production, publication. But the graph itself is the foundation.

The current operator is a single Canadian indie developer/writer who works mostly mobile, mostly between gig-driving deliveries. He has produced ~170 vlogs over the past several months. The current Neolog code transcribes these and runs a 34-field extraction prompt that is being torn down and rebuilt as part of this work.

---

## What's in this package

The package has four kinds of artifact:

**1. The architectural specification.** `NEOLOG.md` is the master spec. 2,061 lines. Describes every subsystem: the graph, extraction, clustering, cultivation, production engines, voice profiles, visual treatment, motifs, performance loop. This is the ground truth. When prototypes and demos disagree with the spec, the spec wins.

**2. The database schema.** `NEOLOG_SCHEMA.md` is the companion data layer. 26 tables across 10 domains. Includes migration plan from current code state. Read this alongside `NEOLOG.md`.

**3. Worked examples — paper simulations.** Four documents that show what the system should produce when run end-to-end against real source material:
  - `NEOLOG_DEMO.md` — first demo run, founder's-trap riff cluster, full output across cluster object, script, visual treatment.
  - `NEOLOG_DEMO_V2.md` — re-run with corrections, manifesto_rant form, voice preservation rules tightened.
  - `NEOLOG_SPINE_v1.md` — worked spine for the algorithm-critique cluster in aphoristic_probe form.
  - `NEOLOG_CANDIDATES_SIMULATION.md` — paper simulation of the surfacing pattern at three zoom levels.

  These are the proof of concept for the architecture. They show what the output looks like, not just what the system does. Use them as reference for what the system should produce.

**4. The prototype gallery.** `neolog-app/` contains 22 standalone HTML prototypes. Each has the design system inlined and is independently viewable. The prototypes specify the operator-facing surfaces — what each page looks like, how it behaves, what data it shows, how interactions work. Open `index.html` in the gallery to see all pages organized in three groups (top-level, deep links, auth & states).

  The design system is locked: warm dark surface (umber-tinted near-black), bone-white type, ten topic territory colors, Geist body type with JetBrains Mono for metadata. Three rotating logo marks per session (Aperture, Stratum, Filament).

---

## Order to read

For full context, read in this order:

1. `NEOLOG.md` sections 1–6 (vision, graph substrate, extraction)
2. `NEOLOG.md` section 7 (clustering and production types)
3. `NEOLOG.md` section 8 (production engine for video_essay, the most architecturally complete pipeline)
4. `NEOLOG.md` section 9 (visual treatment system) and 10 (motif system)
5. `NEOLOG_DEMO_V2.md` (most current demo run; see what good output looks like)
6. `NEOLOG_SCHEMA.md` (data layer)
7. The prototype gallery — start with `neolog-app/timeline.html` (the heart) and follow links

Sections 11–18 of `NEOLOG.md` cover performance loop, prompt management, error handling, reconciliation with existing code, scope decisions, and reading order. Sections 13 (founder's-trap demo essay placeholder) and 19+ are stubs — refer to `NEOLOG_DEMO.md` and `NEOLOG_DEMO_V2.md` instead.

---

## What's already built (will be in the codebase)

- Supabase auth, user accounts
- Vlog upload via Cloudflare R2 with multipart for large files
- Transcoding HEVC → H.264 before thumbnail extraction (already working — handles iPhone HEVC sources correctly)
- mvhd-atom recording-date extraction from MP4 files (already working — preserves true recording date even when files are uploaded later)
- Whisper/AssemblyAI transcription with word-level timestamps in `transcript_words` table
- Existing 34-field extraction prompt to `video_uploads.analysis` JSONB — being torn down per spec
- Existing entity extraction with `entities` and `entity_mentions` tables — being refactored per schema doc
- Existing Studio / Edit / Posts pages — being torn down or repurposed per spec section 14
- Some Inngest job orchestration

When in doubt about what currently works, read the codebase, not these docs. The codebase is the ground truth for "what currently works." These docs are the ground truth for "what should be built."

---

## What's deprecated

The following are explicitly being removed:

- **Pages:** Home, Posts, Edit, Live feed (they are *collapsed into Timeline as card types* — see spec 4.5)
- **Tables:** `social_queue`, legacy `posts` / `post_versions`, ActivityPub tables, subscriptions tables
- **The 34-field analysis JSONB column** in `video_uploads`
- **The "session card" framing** in Studio (sessions are vlogs; the new Studio works on clusters)

---

## Stack

- Next.js (existing)
- Supabase Postgres (existing)
- Cloudflare R2 for media storage (existing)
- Inngest for job orchestration (existing)
- Anthropic Claude API for extraction, clustering, ideator, bounce, scripts
- Groq Whisper / AssemblyAI for transcription (existing)
- Generative video stack for visual treatment: Flux, Wan2.1 VACE, Veo, Kling, Runway (per spec section 9)
- Vercel deployment (existing)

---

## Conventions

- Soft delete for user-facing nodes (`deleted_at`); hard delete for system tables
- RLS on every user-data table
- Prompts are versioned; extraction outputs reference `prompt_version` for performance attribution
- No arbitrary thresholds in code — every formula has a name and a documented version
- Voice profile applied at materialization time, not stored permanently with cluster

---

## What this package does NOT specify

By design, the following are left for implementation:

- **Literal prompt strings.** The architecture specifies what each prompt does, what it receives, what it produces. The actual prompt text is yours to write — it will be iterated heavily once real data flows through. Use the demo runs as reference for what good output looks like.
- **Threshold formulas.** Ripeness scoring is a composite (per spec); pick reasonable starting weights and tune in production.
- **API endpoint shapes.** Inferable from the prototype data shapes and the schema. Define them as you build.
- **Test strategies.** The work is largely model-mediated; integration tests against real vlog data matter more than unit tests against mocks.
- **Deployment specifics.** Existing deployment continues; migrate as needed.

---

## The handoff intent

This is a complete architectural specification, prototype gallery, and worked-example library. The intent is for you to interpret it, make recommendations, upgrade the existing architecture in line with what's specified here.

Where the spec is precise (visual prompt template, cluster data structure, capture intent declarations, surfacing card subtypes, voice profile system), follow it.

Where the spec is general (formula weights, prompt wording, retry policies, exact UI copy), use judgment. The prototypes show desired behavior; the demos show desired output.

Nothing in this package is a phase plan or a deadline. Build the system the package describes.

---

*Package contents:*

```
NEOLOG.md                          — master architectural spec
NEOLOG_SCHEMA.md                   — data layer + migration plan
NEOLOG_DEMO.md                     — paper simulation v1
NEOLOG_DEMO_V2.md                  — paper simulation v2 (current)
NEOLOG_SPINE_v1.md                 — worked spine, aphoristic_probe form
NEOLOG_CANDIDATES_SIMULATION.md    — surfacing pattern simulation
README.md                          — this file
neolog-app/                        — prototype gallery (22 HTML files, CSS inlined)
  index.html                       — gallery entry point
  landing.html                     — public marketing page
  signin.html / signup.html        — auth
  onboarding.html                  — 4-step setup
  timeline.html                    — the heart (heterogeneous-card single-feed)
  studio.html                      — deliberate-work mode (cluster cultivation)
  cluster.html                     — single cluster detail
  thread.html                      — single thread detail
  post.html                        — post composer / detail
  clip.html                        — clip preview / trim / ship
  article.html                     — long-form drafting view
  broll.html                       — B-roll asset detail
  attachment.html                  — reference material detail (PDF / screenshot / article)
  vlog.html                        — single vlog detail
  materialize.html                 — production setup
  project.html                     — single project detail (creative_work)
  projects.html                    — projects list
  graph.html                       — graph view
  record.html                      — capture (vlog and B-roll modes)
  settings.html                    — operator profile, voice profiles, integrations
  system.html                      — pipeline status
  states.html                      — empty / loading / error reference
  public.html                      — public-facing profile (neolog.ai/{handle})
  timeline_standalone.html         — timeline with CSS inlined for sharing
```
