# Neolog filament-update reconciliation report

**Status:** awaiting operator sign-off
**Branch:** `claude/integrate-filament-update-XWb1v`
**Pre-rebuild commit tag:** to be applied in Phase 1
**Source spec:** `filament-update/NEOLOG.md`, `filament-update/NEOLOG_SCHEMA.md`, prototypes in `filament-update/*.html`

This document is the **first concrete artifact** of the filament-update integration, mandated by NEOLOG.md §14 and §18 before any code change ships. It compares what the spec describes against what currently exists in the repository, and assigns a **disposition** (keep / refactor / replace / drop / dormant / locked) per area. The disposition column drives sequencing in subsequent phases.

Operator clarifications already applied:

- Cloudflare Pages stays. No migration to Workers.
- `video_uploads.analysis` → renamed `legacy_analysis` (freeze, not drop). No bulk re-extraction.
- Voice profile: "Operator default" only. Crystal Ford struck from the package.
- Auto-link enabled day one with conservative confidence threshold; transparency via `Surfaced · Auto-link` cards.
- Lo-Fi default. No Hi-Fi unlock yet.
- No gold set, no up-front voice profile content. Iterate prompts on incoming vlogs as they arrive.
- Full design system migration to bone/ink/Geist + topic-territory palette.
- `CLAUDE.md` replaced top-to-bottom; thumbnail + backdating callouts carried forward verbatim.

---

## Locked invariants (do not touch)

These code paths and migrations are working and load-bearing. Carry forward unchanged through every subsequent phase. The new `CLAUDE.md` will reproduce these block-quote warnings verbatim.

| Path | Lines | Why locked |
|---|---|---|
| `src/inngest/functions/process-upload.ts` | 161–170 | `readMp4CreationTime()` — mvhd atom range fetch + walk |
| `src/inngest/functions/process-upload.ts` | 193–208 | `readMvhdDate()` — MP4 epoch offset (2082844800), v0/v1 branch |
| `src/inngest/functions/process-upload.ts` | 375–432 | three-tier `recorded_at` fallback: pre-extracted → mvhd → filename pattern → created_at |
| `src/inngest/functions/process-upload.ts` | 459–505 | `transcode-playback` (HEVC → H.264) **before** `extract-thumbnail`. DJI Mimo HEVC vertical files have rotation metadata that returns 0 frames if extracted directly. |
| `src/inngest/functions/process-upload.ts` | 608–632 | `transcript_words` population — Groq primary, Replicate Whisper fallback |
| `src/inngest/functions/backfill-recorded-at.ts` | full file | filename date-pattern recovery (YYYY-MM-DD HH:MM:SS, YYYYMMDD_HHMMSS, etc.) |
| `src/lib/ai-provider.ts` | full file | per-user key resolution via `integration_keys` with managed-key fallback for Pro users |
| `src/app/api/social/x/connect/route.ts` | full file | X OAuth start |
| `src/app/api/social/x/callback/route.ts` | full file | X OAuth token exchange → `social_integrations` upsert |
| `src/app/api/social/x/publish/route.ts` | full file | X publish, including `refreshXToken()` at lines 9–41 |
| `src/app/api/posts/publish/route.ts` | full file | alternative publish path with inline token refresh |
| `supabase/migrations/20260310_add_recorded_at_to_uploads.sql` | full file | `recorded_at` column + index |
| `supabase/migrations/add_thumbnail_url.sql` | full file | `thumbnail_url` column + partial index |
| `supabase/migrations/20260313_add_transcript_words.sql` | full file | word-level timestamp table |
| `src/app/(dashboard)/dashboard/_archived/` | all 9 dirs | per current CLAUDE.md: do not link in nav, do not delete |

**The stored thumbnail format** (data-URI base64 in `video_uploads.thumbnail_url`, bypassing signed-URL expiry) is also locked. The new vlog detail surface in Timeline v2 reads from this column unchanged.

---

## §1. Substrate (NEOLOG.md §5 — the graph)

**What exists**
- Implicit graph in `entities` + `entity_mentions`. ~150 vlogs / 171 sessions of accumulated data.
- Word-level timestamps complete (`transcript_words`) — ready to power thread `transcript_span` computation without re-transcription.
- R2 multipart upload + HEVC transcode + thumbnail pipeline all working.

**What is partial**
- `entities` has `type` (project|idea|person|goal|question|habit|topic|commitment|skill|blocker) but lacks `entity_type` semantic split (person|place|project|tool|concept|theme|reference) the spec wants. Backfillable from existing `type`.
- `entity_mentions` has shallow polymorphism: `(video_upload_id, log_entry_id)` with `source_type` ∈ {video, chat, text, capture}. Spec wants `(source_kind, source_id)` over (vlog, thread, cluster, production, creative_element). Schema-additive — old columns kept dormant during transition.

**What is missing**
- Threads, creative_elements, clip_candidates as first-class tables.
- Connection graph (`thread_connections`).
- Clusters, macro_clusters, surfaced_cards, bounce_runs, cluster_insights.
- Voice profiles, broll_assets, attachments, projects (creative_work), characters.
- Productions v2 schema (production_beats, production_visual_assets, motifs).
- `prompts` versioning table, `extraction_runs` audit table, `pipeline_jobs` audit table.
- Operator profile separate from `profiles` (spec wants `operator_profiles` with handle, public_share_enabled, default_voice_profile_id). Decision: extend existing `profiles` table rather than introduce parallel `operator_profiles`. Less migration risk; same semantics.

**Disposition: refactor + extend.** Add 26 new tables in Phase 2. Refactor `entities` and `entity_mentions` columns additively (rename `user_id` → `operator_id` only on these three tables: `video_uploads`, `entities`, `entity_mentions`). Extend `profiles` with the new operator-context fields.

---

## §2. Extraction (NEOLOG.md §6)

**What exists**
- `src/lib/video-analysis.ts` produces a **49-field JSONB** (recon found 49, not 34 as the spec writes — the spec's count was approximate or referenced an older iteration). Single Claude call, model `claude-haiku-4-5`, prompt at lines 12–138, version stamp `ANALYSIS_PROMPT_VERSION = '1.5'` embedded in output. Written to `video_uploads.analysis`.
- Entity extraction runs as part of the same call (video-analysis.ts:293–496), upserts into `entities` and `entity_mentions` with `source_type='video'`.
- Pages reading `.analysis`: Home (`/dashboard`), Timeline (`/dashboard/timeline`), Brain (`/dashboard/brain`), Synthesis (`/dashboard/synthesis`), API routes `/api/edit/plan`, `/api/social-queue`.

**What is partial**
- A version stamp exists but no versioned `prompts` table — can't run two prompt versions side-by-side, can't attribute a thread to "extracted under v3 of the analytical prompt."

**What is missing**
- The thread atom and the three-pass model (analytical, creative-mode, clip-candidate).
- `abstracted_topic` field on extracted units — required for clustering.
- Voice-preservation hard check (each take/key_quote must contain a verbatim 4+ word substring from the source transcript).
- Conservative strength scoring per spec §6.1.7.

**Disposition: replace, with old kept dormant for read.**
- Phase 2 renames `video_uploads.analysis` → `legacy_analysis`. Existing 171 vlogs keep their data unchanged.
- Phase 3 builds three new Inngest functions (`extract-threads.ts`, `extract-clip-candidates.ts`, `extract-creative-elements.ts`) at Sonnet, with prompts loaded from a new `prompts` table. Fans out from `process-upload.ts` after transcription completes, in parallel with — not replacing — the legacy `analyze` step during transition.
- Re-extraction of old vlogs is opt-in per vlog (button on vlog detail page), never bulk.
- Iteration loop: operator flags wrong takes/topic boundaries in Timeline v2 → prompt updated as new `prompts.version` row → per-thread `extraction_prompt_version` tag preserves attribution.

---

## §3. Clustering & cultivation (NEOLOG.md §7)

**What exists**
- Nothing structurally. `marinating_ideas` table has a similar shape (signal accumulation across sessions) but is not the spec's clustering model.
- `synthesize-user-graph.ts` Inngest function does cross-session synthesis — closest existing analogue, but it's vlog-level not thread-level.

**What is partial**
- `idea_cards` table holds extracted-content candidates per session — closer to spec's "thread" than to "cluster," but missing `abstracted_topic`, `riff_cluster_id`, and the connection graph.

**What is missing**
- Riff detection (3+ recent threads share abstracted_topic → flag riff in progress).
- Connection graph (`thread_connections`, undirected edges with `thread_a_id < thread_b_id` ordering).
- Cluster lifecycle: `forming → surfaced → ripening → hold_for_more → ready → materialized → produced → archived`.
- Ripeness scoring (composite of thread density, take strength, voice richness, bounce-readiness).
- Adjacent insights / bounce (`cluster_insights`, `bounce_runs`).
- Macro-clusters (`macro_clusters`, `macro_cluster_members`).
- The `Surfaced` card type and its five subtypes (cluster_ready, adjacent_insight, gap_question, new_evidence, auto_link).

**Disposition: build new, in dependency order.**
- Phase 4 builds the connection graph + cluster auto-formation (3+ matching abstracted_topics → cluster row in `state='forming'`). Auto-link with a starting threshold of 0.85 cosine on embeddings (or strict abstracted_topic equality, decided during build). Every auto-link emits a `Surfaced · Auto-link` card with manual unlink.
- Phase 7 builds bounce + ripeness composite + gap_question detection.
- Phase 9 builds macro-clusters (last — needs production volume to be useful).

---

## §4. Production engine (NEOLOG.md §8)

**What exists**
- `productions` table (`scripts`, `style_cards`, `idea_cards`, `marinating_ideas` migration `20260413000000_neolog_rebuild.sql`).
- Studio session-card flow: `/dashboard/studio/page.tsx`, `RecordScreen.tsx` (beat-by-beat record), `produce-studio-video.ts` (script via Claude), `assemble-studio-audio.ts`, `generate-segment-visuals.ts` (Flux), `compose-studio-video.ts` (FFmpeg via Replicate).
- Pipeline status flow `queued → running → scripted → assembling → generating-visuals → composing → done` working end-to-end.

**What is partial**
- `productions.estimated_cost_cents` + `productions.user_approved_cost` exist but not wired to a tier picker UI. Per operator: Lo-Fi default, no Hi-Fi unlock yet — leave dormant.
- `RecordScreen.tsx` works for the existing session-card model but is bound to the `scripts.script_json` shape. Spec wants `production_beats` rows (one per beat, with audio_r2_key, take_number, superseded_takes for retake history).

**What is missing**
- Form-specific ideators (concept_essay / manifesto_rant / reflection / cultural_criticism / probe / aphoristic_probe). Currently one ideator template serves all.
- Cluster-derived materialization (current Studio is one-vlog-in, one-production-out; spec is cluster-in, production-out).
- Coherence-check pass on generated scripts (catch LLM-default essay register).
- Voice profile applied at materialization (only "Operator default" in scope per operator).
- `production_beats`, `production_visual_assets`, `motifs`, `production_motifs`.
- Forensic mode (deferred — depends on real cluster volume).
- Article / x_post / x_thread / clip pipelines as cluster outputs (the underlying `clip_candidates` detection pass and the X publish endpoint stay; only the surface changes).

**Disposition: replace surface, refactor table, reuse beat-record pattern.**
- Phase 6 builds Studio v2 at `/dashboard/studio-v2` reading from new `clusters` table. Materialize action creates a row in a new `productions_v2` table (named to avoid clobbering the existing `productions` while in transition).
- `RecordScreen.tsx` pattern reused; underlying state binds to `production_beats` rows.
- video_essay only at Lo-Fi tier in Phase 6. Article / x_post / x_thread / clip pipelines in Phase 8.
- Phase 9 deletes old Studio surface + drops `idea_cards`, `marinating_ideas`, `style_cards` (subsumed into clusters / cluster_insights / production-form metadata) after operator confirms parity.

---

## §5. Operator-facing surfaces (NEOLOG.md §4.5)

The spec collapses the current 14-page dashboard into **five dock entries**: Timeline · Studio · Graph · Projects · Settings. Plus Capture as a global floating action.

| Current page | Path | Disposition | Notes |
|---|---|---|---|
| Home | `/dashboard` | **drop** | No Home in new flow. App opens directly into Timeline. Reads `log_entries`, `video_uploads.analysis`, `post_candidates`, `entities` — all readable through other surfaces. Phase 5 redirects `/dashboard` → `/dashboard/timeline-v2`. Phase 9 deletes the page. |
| Videos | `/dashboard/videos` | **fold into Capture + Timeline** | Upload UI moves into the Capture floating action. Listing folds into Timeline (Vlog cards). |
| Timeline | `/dashboard/timeline` | **replace** | New `/dashboard/timeline-v2` ships in Phase 5 as heterogeneous-card single-feed sorted by `recorded_at`. Old route stays live until parity confirmed; deleted in Phase 9. |
| Posts | `/dashboard/posts` | **fold into Timeline as Post-cards** | X OAuth + publish endpoints stay intact; only the surface changes. Page deleted Phase 9. |
| Studio | `/dashboard/studio` | **replace** | New `/dashboard/studio-v2` in Phase 6 = cluster detail (deliberate-work mode). Old route deleted Phase 9. |
| Edit | `/dashboard/edit` | **fold into Timeline as Clip-cards** | Underlying clip-detection pipeline (new `extract-clip-candidates.ts`) preserved. Page deleted Phase 9. |
| Brain | `/dashboard/brain` | **drop** | The 6-region intelligence view is replaced by Graph (territory view) + Surfaced cards on Timeline. Reads `entities`, `marinating_ideas`, `video_uploads.analysis` — all readable elsewhere. |
| Entities | `/dashboard/entities/[id]` | **keep, refactor** | Entity detail page is the most useful navigation pattern; spec keeps it as a node-centric view reachable from Timeline/Graph. Phase 7: refactor to read new `entity_mentions` polymorphic shape. |
| Settings | `/dashboard/settings` | **replace** | New `/dashboard/settings-v2` in Phase 7 adds voice profile management (Operator default), retains API key + storage management. |
| System | `/dashboard/system` | **keep, palette only** | Pipeline status + prompt management is exactly what spec §4.5.7 describes. Wire to new `prompts` table and `pipeline_jobs`. |
| Character | `/dashboard/character` | **dormant** | Voice clone + face LoRA — per existing CLAUDE.md, deprioritized. Leave alive but not in nav. |
| Projects | `/dashboard/projects` | **replace** | New `/dashboard/projects-v2` in Phase 7 reads new `projects_v2` table with characters, themes, mood references. |
| Profile | `/dashboard/profile` | **keep, palette only** | Public-facing profile view; spec keeps. |
| Synthesis | `/dashboard/synthesis` | **dormant → drop** | Partial implementation of macro-clusters (§7.4.12.2). Subsumed into Phase 9 macro-cluster build. |
| Inventory | `/dashboard/inventory` | **dormant** | Asset library not currently in nav. Subsumed into Capture / B-roll library Phase 7. |
| Portfolio | `/dashboard/portfolio` | **keep, palette only** | Public portfolio view. |
| Sessions | `/dashboard/sessions` | **drop** | Session-card framing is being removed per spec §14. |
| Queue, Log, Ingest, Uploads | `/dashboard/{queue,log,ingest,uploads}` | **dormant → drop** | Verify with operator before Phase 9 deletion. |

---

## §6. Voice profile system (NEOLOG.md §7.4.8)

**What exists**
- `profiles.voice_profile` JSONB column added in `add_content_studio.sql`. Holds free-form data; not the spec's library model.
- Inngest stub `trigger-voice-clone.ts` for ElevenLabs; per CLAUDE.md, deprioritized.

**What is missing**
- `voice_profiles` table.
- "Operator default" reference-corpus auto-population (initial reference texts pulled from operator's existing transcripts, not hand-written).
- Selection at materialization time (script generator reads voice profile from cluster's `voice_profile_id`).
- Cadence / register / vocabulary preference notes.

**Disposition: build minimal.**
- Phase 7: `voice_profiles` table with one row "Operator default" per operator. Reference texts auto-populated from operator's longest 10 thread `key_quotes` once threads exist. No hand-written cadence/register notes — iterate from output.
- No "Crystal Ford" profile, no character profiles in initial scope.

---

## §7. Capture (NEOLOG.md §4.5.8)

**What exists**
- Vlog upload via R2 multipart (working).
- mvhd atom + filename pattern recorded_at extraction (locked, see invariants).
- Auto-classification by speech presence — partial: speech-detection is implicit in transcription but no explicit "no speech → B-roll candidate" prompt.

**What is missing**
- B-roll record mode (camera-only, no transcription, vision-tagging only).
- Reference material upload (PDFs, screenshots, articles → `attachments` table with cluster/project routing).
- Explicit backdate prompt for material lacking recording-date metadata.
- Project routing at capture time.

**Disposition: build new modes additively.** Phase 7. Existing mvhd path + the locked thumbnail pipeline are not touched.

---

## §8. Cross-pipeline infrastructure

**What exists (keep)**
- Inngest orchestration (21 functions inventoried, see `docs/inngest-events.md` to be created in Phase 1).
- `src/lib/ai-provider.ts` per-user key resolution. New extraction passes call this same path for the user's Anthropic key.
- Per-user `integration_keys` table (working).
- Inngest events use `kebab/case` naming pattern (e.g., `video-upload/process`, `studio/produce`). New extraction events follow same pattern (`vlog/extract-threads`, `vlog/extract-clip-candidates`, `vlog/extract-creative-elements`) — net-new names, no reuse of in-flight event names.

**What is missing (build)**
- `prompts` table — versioned prompt library.
- `extraction_runs` table — per-vlog audit trail of which pass ran with which prompt version.
- `pipeline_jobs` table — Inngest job tracking replicated for audit.

**Disposition: keep + add audit tables.** Phase 2 adds the three audit/versioning tables.

---

## §9. Drops (deferred to Phase 9)

These exist in the schema today and are slated for drop only after every replacement surface has shipped and operator has used v2 in production for ≥1 week:

| Table | Migration | Currently written by | Drops with |
|---|---|---|---|
| `social_queue` | `20260409_social_sync.sql` | `scatter-scheduler.ts`, `api/social-queue/*`, `api/social/x/publish/route.ts` | After `posts_v2` ships in Phase 8 and re-routes the X publish surface |
| `post_candidates` | `20260413000000_neolog_rebuild.sql` | analysis pipeline, posts page | After Phase 8 |
| `publications` + members | `add_publications.sql` | legacy publishing UI (no longer linked) | Phase 9 |
| `posts`, `post_versions` | pre-existing in schema.sql | legacy ActivityPub flow | Phase 9 |
| `activitypub_*` (7 tables) | `supabase-schema.sql` | unused | Phase 9 |
| `syndication_*` | `20260122_syndication.sql`, `20260122_publishing_api.sql` | unused | Phase 9 |
| `email_subscribers`, `canonical_terms`, `agent_runs` | various | unused | Phase 9 |
| `idea_cards`, `marinating_ideas`, `style_cards`, `scripts` (legacy) | `20260413000000_neolog_rebuild.sql`, `add_content_studio.sql` | old Studio | After Phase 6 confirms parity |

**Not dropped, ever:** `legacy_analysis` (the renamed `video_uploads.analysis` column). It remains the operator's data archive.

---

## §10. Hosting & runtime

**Confirmed staying as-is (no migration):**
- Cloudflare Pages deployment.
- `export const runtime = 'edge'` on every route + page (per existing CLAUDE.md, carried forward).
- Inngest for job orchestration (no migration to Cloudflare Workflows).
- Replicate for FFmpeg (transcode-playback, extract-thumbnail, video assembly) and image generation.
- pnpm + `pnpm install --frozen-lockfile` build.
- Supabase Postgres + Auth + Storage + RLS.

**No new infrastructure required.** The spec mentions Cloudflare Workflows / Queues / Containers; these are additive options not adopted in this rebuild.

---

## §11. AI model defaults

| Use | Current | New |
|---|---|---|
| Extraction (analytical / creative-mode / clip-candidate) | `claude-haiku-4-5` (single 49-field call) | `claude-sonnet-4-6` per pass (three calls fan out in parallel) |
| Riff detection / abstracted_topic match | n/a | `claude-haiku-4-5` (cheap, no web search) |
| Script ideator (form-specific) | `claude-sonnet-4-6` | `claude-sonnet-4-6` |
| Coherence-check pass | n/a | `claude-haiku-4-5` |
| Bounce / adjacent insights | n/a | `claude-sonnet-4-6` (with web search where applicable) |
| Vision tagging (B-roll auto-tags, visual quality scoring) | n/a | `claude-sonnet-4-6` with vision input |

The schema doc references `claude-sonnet-4-5`; this report supersedes that with `claude-sonnet-4-6` per current CLAUDE.md.

---

## §12. Sequencing summary

Phase boundaries match the approved plan. Each phase ends with operator-facing verification before the next begins.

| Phase | Output | Operator gate |
|---|---|---|
| 0 | This document | Operator signs off here before Phase 1 |
| 1 | Pre-flight (backup, smoke tests, design tokens, before/ screenshots, Inngest event inventory, RLS template, feature flag, new CLAUDE.md) | Smoke tests green, screenshots captured |
| 2 | Single schema migration (26 new tables, additive renames, RLS) | Smoke RLS green; existing pages still render |
| 3 | New extraction (3 passes, prompt-versioned, voice-preservation hard check) | New vlog produces threads with verbatim quotes; legacy_analysis still populated; no thumbnail/recorded_at regression |
| 4 | Connection graph + cluster auto-formation + Surfaced cards | 3+ vlogs on same topic auto-form a cluster |
| 5 | Timeline v2 | Visual matches `filament-update/timeline.html`; old timeline still works |
| 6 | Studio v2 + video_essay Lo-Fi production end-to-end | One full essay shipped to MP4 |
| 7 | Bounce, voice profile, capture upgrades, Graph, Projects v2, Settings v2 | Each ships independently |
| 8 | Article / x_post / x_thread / clip pipelines | One x_post published via Timeline Post-card → existing X publish endpoint → live |
| 9 | Macro-clusters, motifs, performance loop, **final cleanup** (drop tables, delete old surfaces) | Old paths return 404; legacy_analysis still readable on old vlogs |

---

## §13. Open items requiring operator input before Phase 1

1. **Confirm the page disposition table in §5 above** — particularly:
   - Is dropping `Home` (the dashboard root page) acceptable, with Timeline v2 as the new landing? *(Spec mandates this.)*
   - Is `Brain` deletable, or should one of its views (e.g. Marinating ideas) survive?
   - The "dormant → drop" pages (Synthesis, Inventory, Sessions, Queue, Log, Ingest, Uploads) — confirm before Phase 9 deletion.
2. **Confirm the renamed column name `legacy_analysis`** is acceptable, or prefer something else (`v1_analysis`, `archived_analysis`).
3. **Confirm `productions_v2` / `posts_v2` / `projects_v2` naming during transition.** Once Phase 9 cleanup runs, the legacy tables drop and the v2 names rename to canonical (`productions` etc.). Acceptable?
4. **Pre-rebuild `pg_dump` location:** R2 with date stamp is the plan. Confirm R2 bucket + path prefix.

Once these are resolved, Phase 1 begins.

---

*End of Phase 0 reconciliation report. No code changes have been made beyond creating this file.*
