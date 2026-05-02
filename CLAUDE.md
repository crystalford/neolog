# Neolog

## What it is

A personal life graph and creative production system. The operator vlogs in real conditions — driving, walking, between gig deliveries — and Neolog ingests those vlogs and refracts them into:

- A permanent, exportable graph of the operator's thinking, work, projects, ideas, relationships
- Threads (atomic units extracted from vlogs) that accumulate into clusters as the operator riffs
- Multi-output productions from ripe clusters: video essays, articles, X posts and threads, video clips
- Surfaced cards that show what the system noticed across the library

The graph is the artifact. Productions are downstream.

The legacy writing platform layer (publications, ActivityPub, syndication) exists in the codebase awaiting Phase 9 cleanup. Do not build into it. Do not delete it yet.

---

## Architectural rewrite in progress

The repo is mid-rewrite from the prior session-card-per-vlog model to the thread-based graph specified in `filament-update/NEOLOG.md`. The reconciliation report at `docs/RECONCILIATION.md` is the canonical plan; the integration plan at `/root/.claude/plans/pre-flight-mitigations-are-the-serene-wren.md` (operator-side) drives sequencing. Read those before making structural changes.

**Pre-rebuild commit tag:** `pre-rebuild` (local; tag-push to remote may be restricted by repo permissions).

**During transition:**
- Old surfaces (Home, Posts, Edit, Brain, Studio v1, Timeline v1) stay live until v2 replacements ship and operator confirms parity.
- New surfaces ship at `*-v2` paths gated behind `NEXT_PUBLIC_NEOLOG_V2`.
- New tables that have a legacy counterpart use `_v2` suffix during transition (`productions_v2`, `posts_v2`, `projects_v2`). Genuinely new tables ship at canonical names directly (`threads`, `clusters`, `surfaced_cards`, `voice_profiles`, `cluster_insights`, `bounce_runs`, etc.).
- The 49-field `video_uploads.analysis` JSONB will be renamed to `legacy_analysis` in Phase 2 (freeze, not drop). The 171 existing vlogs keep their data unchanged. New extraction populates new tables. **Re-extraction of old vlogs is opt-in per vlog, never bulk.**

---

## ⚠️ DO NOT CHANGE — Thumbnail pipeline

`fofr/toolkit` on Replicate accepts only `task`, `input_file`, `fps`. No `ffmpeg_command`.

`transcode-playback` runs **before** `extract-thumbnail` in `process-upload.ts`. This is intentional — DJI Mimo HEVC vertical videos have rotation metadata that causes frame extraction to return 0 frames. Transcoding to H.264 first strips it. Do not swap these steps.

Thumbnails stored as `data:image/jpeg;base64,...` directly in `video_uploads.thumbnail_url` — bypasses signed URL expiry.

**File:line refs (locked):**
- `src/inngest/functions/process-upload.ts:459–505` — transcode-playback → extract-thumbnail order
- Migration `add_thumbnail_url.sql` — column + partial index

## ⚠️ DO NOT CHANGE — Recording date pipeline

`recorded_at` extraction was difficult to get right and is now working. Three-tier fallback: pre-extracted date → MP4 mvhd atom → filename pattern → created_at. The mvhd extraction uses MP4 epoch offset 2082844800 with v0/v1 branch handling.

**File:line refs (locked):**
- `src/inngest/functions/process-upload.ts:161–170` — `readMp4CreationTime()`
- `src/inngest/functions/process-upload.ts:193–208` — `readMvhdDate()`
- `src/inngest/functions/process-upload.ts:375–432` — three-tier fallback
- `src/inngest/functions/backfill-recorded-at.ts` — filename pattern recovery
- Migration `20260310_add_recorded_at_to_uploads.sql` — column + index

## ⚠️ NO CAPTIONS OR TEXT OVERLAYS — ever

These are documentary / short film / video essay productions. **Never add captions, subtitles, or text overlays to video output.** No burned-in text, no SRT files, no caption tracks, no lower thirds. The visual track is purely cinematic. The audio carries the narration.

---

## What's locked in addition to the above

- `src/lib/ai-provider.ts` — per-user API key resolution via `integration_keys` with managed-key fallback for Pro users. Every new AI call goes through this.
- `src/inngest/functions/process-upload.ts:608–632` — `transcript_words` population (Groq primary, Replicate Whisper fallback). Word-level timestamps are used downstream for thread `transcript_span` computation.
- X OAuth + publish: `src/app/api/social/x/connect/route.ts`, `callback/route.ts`, `publish/route.ts`, `src/app/api/posts/publish/route.ts`. The new Post-card surface in Timeline v2 calls these endpoints unchanged.
- `_archived/` directories under `src/app/(dashboard)/dashboard/_archived/` — do not link in nav, do not delete.

---

## The five surfaces (target architecture)

The dock has five entries: **Timeline · Studio · Graph · Projects · Settings**. Capture is a global floating affordance above the dock. There is no Home page — the app opens directly into Timeline.

| Surface | Path | What it is |
|---|---|---|
| Timeline | `/dashboard/timeline-v2` | Heart of the app. Single chronological feed of heterogeneous cards (Vlog, Thread, Post, Clip, Article, B-roll, Attachment, Project update, Surfaced) sorted by `recorded_at`. Filterable via pill row. |
| Studio | `/dashboard/studio-v2` | Deliberate-work mode. Cluster detail view reached from `Surfaced · Cluster ready` cards on Timeline. The cluster detail view *is* Studio. |
| Graph | `/dashboard/graph` | Direct navigable view of the substrate. Nodes colored by topic territory. |
| Projects | `/dashboard/projects-v2` | Long-form creative_work containers (Pack Rats, etc.). Different rhythm from the rest. |
| Settings | `/dashboard/settings-v2` | Operator profile, voice profiles, API keys, integrations, storage. System surface reachable from here. |

Old surfaces (Home, Posts, Edit, Brain, Sessions, Synthesis, Inventory, Queue, Log, Ingest, Uploads) are slated for deletion in Phase 9 after parity is confirmed on the new ones. Don't add features to deprecated surfaces.

---

## The three extraction passes

Every ingested vlog runs three parallel passes after transcription, plus entity extraction:

| Pass | Output table | Model | Purpose |
|---|---|---|---|
| Analytical | `threads` | claude-sonnet-4-6 | Atomic units. topic / take / key_quotes / questions_raised / register / strength / abstracted_topic |
| Creative-mode | `creative_elements` | claude-sonnet-4-6 | Fictional / creative material for projects |
| Clip-candidate | `clip_candidates` | claude-sonnet-4-6 | Delivery moments (operator nailed a segment cleanly) |
| Entity | `entities` / `entity_mentions` | claude-sonnet-4-6 | People, places, projects, tools, concepts, themes, references |

Every extraction call writes through `src/lib/extraction/prompt-loader.ts` which reads from the `prompts` table by `(name, is_active=true)`. Every output row carries the `extraction_prompt_version` it was produced under. **Iterate prompts on incoming vlogs as they arrive** — no gold set, no batch re-runs. When a take is sanitized or a topic boundary is wrong, the operator flags it in Timeline v2; the prompt updates as a new `prompts.version` row.

**Voice preservation hard rule:** each thread's `take` and at least one `key_quote` must contain a verbatim 4+ word substring from the source transcript. Failed runs log and skip the write — do not corrupt the table with sanitized voice.

---

## Voice profile

One profile per operator: **"Operator default."** Reference corpus auto-populated from the operator's longest 10 thread `key_quotes` once threads exist. No hand-written cadence/register notes — iterate from output. **No "Crystal Ford" profile, no character profiles in initial scope.**

---

## Production tier

**Lo-Fi only at this stage.** No Hi-Fi unlock. The `productions_v2.estimated_cost_cents` and `user_approved_cost` columns exist but are not wired to a tier picker. Don't build the tier picker until the operator asks.

---

## Riff detection

The clustering engine's primary job is recognizing **riffs** as they form — runs of 3 to 20 vlogs over a short timeframe all circling the same underlying thing from different angles. Auto-link is enabled day one with a conservative confidence threshold (starts at 0.85 cosine on embeddings or strict abstracted_topic equality, operator-tunable in Settings v2). Every auto-link emits a `Surfaced · Auto-link` card with manual unlink. Transparency comes from these cards, not from gated approval.

A future agent who tries to make clustering "smarter" by surfacing hidden cross-thread connections before solving riff-recognition is solving the wrong problem. Riff-first, cross-riff second.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router |
| Runtime | Cloudflare Edge — `export const runtime = 'edge'` on every route + page |
| Hosting | Cloudflare Pages (NOT Vercel) — logs visible in Cloudflare dashboard |
| Package manager | **pnpm** (NOT npm) — Cloudflare build uses `pnpm install --frozen-lockfile`. Do not generate `package-lock.json`. |
| Database | Supabase (Postgres + RLS) |
| Storage | Supabase Storage (videos) + Cloudflare R2 |
| Uploads | Multipart direct to R2 via presigned URLs |
| Async jobs | Inngest |
| Transcription | Groq Whisper v3-turbo (primary) / Replicate Whisper (fallback) — both produce word-level timestamps |
| AI | Claude `claude-sonnet-4-6` for extraction + ideation; Claude `claude-haiku-4-5` for cheap classification + coherence-check |
| Video processing | Replicate FFmpeg (`fofr/toolkit`) |
| Image generation | Flux (Lo-Fi tier only at this stage) |
| Auth | Supabase Auth |
| Styling | Inline styles importing tokens from `src/lib/design.ts`. No Tailwind classes for new pages, no CSS variables in component code. |

The spec mentions Cloudflare Workflows / Queues / Containers — these are additive options NOT adopted. Stay on Inngest for orchestration.

---

## Design system (new — bone/ink/Geist + topic territories)

Cinematic warm dark. Bone-on-ink. Geist body, JetBrains Mono for metadata only.

**Tokens live in `src/lib/design.ts`.** Import from there; do not redefine inline.

```typescript
import { INK, BONE, TOPIC, STATE, FONT_BODY, FONT_MONO } from '@/lib/design'
```

Three rotating logo marks per session: Aperture, Stratum, Filament. Ten topic territory colors: brass, terra, ochre, rose, plum, violet, steel, teal, sage, moss.

**Migration is page-by-page.** The legacy amber `C` color object stays alive on unmigrated pages. No global find-replace. Take a screenshot to `docs/before/` before migrating any page.

**Old design system (deprecated — do not use on new pages):** the amber `C` object inlined in 14+ files, the `--amber` / `--bg-surface` CSS variables in `globals.css`, Syne for headlines.

---

## Database — key tables

**Substrate (kept):**

| Table | Purpose |
|---|---|
| `auth.users` | Supabase managed |
| `profiles` | Operator profile data; extended in Phase 2 with operator-context fields |
| `video_uploads` | Vlog metadata + transcripts. `analysis` column renamed to `legacy_analysis` in Phase 2. |
| `transcript_words` | Word-level timestamps |
| `entities` | Extended in Phase 2 with `entity_type`, `aliases`, `notes` |
| `entity_mentions` | Extended in Phase 2 with polymorphic `(source_kind, source_id)` over (vlog/thread/cluster/production/creative_element) |
| `integration_keys` | Per-user API keys (resolved via `lib/ai-provider.ts`) |
| `social_integrations` | X OAuth tokens |

**New (added in Phase 2):**

`threads`, `creative_elements`, `clip_candidates`, `thread_connections`, `clusters`, `cluster_threads`, `cluster_insights`, `bounce_runs`, `macro_clusters`, `macro_cluster_members`, `productions_v2`, `production_beats`, `production_visual_assets`, `motifs`, `production_motifs`, `projects_v2`, `characters`, `surfaced_cards`, `posts_v2`, `extraction_runs`, `prompts`, `pipeline_jobs`, `broll_assets`, `attachments`, `voice_profiles`, plus `operator_profiles` columns folded into existing `profiles`.

**Legacy (slated for Phase 9 drop, do not write to from new code):**

`social_queue`, `post_candidates`, `publications`, `posts` (legacy), `post_versions`, `activitypub_*` (7 tables), `syndication_*`, `email_subscribers`, `canonical_terms`, `agent_runs`, `idea_cards`, `marinating_ideas`, `style_cards`, legacy `scripts`, legacy `productions`.

---

## Key env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
REPLICATE_API_TOKEN       — audio extraction + video assembly + thumbnail extraction
X_CLIENT_ID               — X OAuth
X_CLIENT_SECRET
NEXT_PUBLIC_NEOLOG_V2     — gates new v2 surfaces during transition
```

Users supply Anthropic / OpenAI / ElevenLabs / Replicate keys via Settings → API. Resolved per-user at runtime via `lib/ai-provider.ts`.

---

## Inngest events

Inventory at `docs/inngest-events.md`. **Net-new events for the rewrite use unique names** (`vlog/extract-threads`, `vlog/extract-clip-candidates`, `vlog/extract-creative-elements`, `cluster/auto-link`, `cluster/bounce`, `cluster/cultivate`, `production/coherence-check`). No reuse of in-flight legacy event names.

---

## Pre-flight infrastructure (Phase 1)

The rewrite sits on top of these. Verify before each PR that the relevant smoke test passes:

- `scripts/smoke-thumbnails.ts` — uploads four reference vlogs (DJI HEVC vertical, iPhone HEVC, MP4 with mvhd, MP4 without) and asserts thumbnails + `recorded_at` correct. **Run this on every PR that touches `process-upload.ts` or any video ingestion path.**
- `scripts/smoke-rls.ts` — creates two test users, asserts zero data leakage between them. **Run this on every PR that adds a new user-data table.**
- `supabase/policies/standard-owner-policy.sql` — applied to every new user-data table. One pattern, zero variation.
- `docs/before/` — full-page screenshots of every current dashboard page at the `pre-rebuild` tag. Visual A/B reference for palette migration.

---

## Rules for Claude

- **Always update this document** when a feature is built, a decision is made, or priorities change. Same commit.
- Use `claude-sonnet-4-6` for AI features that do real work; `claude-haiku-4-5` for cheap classification and coherence-check.
- `export const runtime = 'edge'` on every route and page — non-negotiable.
- Never hardcode API keys — always resolve per-user via `lib/ai-provider.ts`.
- New pages: import design tokens from `src/lib/design.ts`. Inline styles only. No new Tailwind classes for v2 surfaces.
- Never route file uploads through API routes (Vercel 4.5MB limit, even though we're on Pages — the constraint informs the upload pattern).
- The `_archived/` directories exist — do not link them in nav, do not delete them.
- Do not preserve the 49-field extraction schema. The thread-based replacement is the only forward path.
- Do not sanitize voice in extraction outputs. Profanity, hesitations, fragmentary phrasings stay. The hard 4-word verbatim check enforces this.
- Do not generate scripts from thread takes only — the ideator must receive full source vlog transcripts alongside the cluster object.
- Do not put the operator at the center of video essay scripts. The operator's vlogs identified the topic; the script is *about* the topic, not about the operator's experience of it.
- Do not auto-publish without operator review. Publish surface is operator-gated.
- Do not introduce camera-on production paths in current scope. Future product.
- Do not build the tier picker UI until operator asks — Lo-Fi only.
- Do not bulk re-extract old vlogs. Re-extraction is opt-in per vlog.

---

## Help

- /help: Get help with using Claude Code
- To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues
