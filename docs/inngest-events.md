# Neolog Inngest event inventory

Exhaustive list of every event currently in flight in the codebase, plus every net-new event the filament-update rewrite will introduce. **No event-name reuse** — new functionality always gets a new event name to avoid mid-deploy routing collisions with in-flight jobs.

Last updated: Phase 1 of filament-update integration.

---

## Legacy events (kept — already in flight)

These events are produced and consumed by current code. They continue working through the rewrite. Some will be deleted in Phase 9 cleanup once their consuming functions are removed.

| Event | Producer | Consumer | Status |
|---|---|---|---|
| `video-upload/process` | `/api/video-upload/route.ts` (and re-trigger paths) | `process-upload.ts` | **kept** — substrate ingestion. Will fan out to new extraction events after transcription completes (Phase 3). |
| `app/capture.process` | capture API routes | `process-capture.ts` | **kept** — chat/text capture. |
| `app/chat.complete` | chat session completion | `process-chat.ts` | **kept**. |
| `app/text.process` | text import | `process-text.ts` | **kept**. |
| `clip-session/assemble` | edit page (legacy) | `assemble-clip.ts` | **deprecated** — drops with Edit page deletion in Phase 9. Underlying clip detection logic moves to new `vlog/extract-clip-candidates`. |
| `studio/auto-edit` | edit page (legacy) | `auto-edit.ts` | **deprecated** — drops with Edit page deletion in Phase 9. |
| `neolog/develop-idea` | post-extraction trigger | `develop-idea.ts` | **deprecated** — replaced by cluster-driven script generation in Phase 6. |
| `studio/produce` | studio v1 | `produce-studio-video.ts` | **deprecated** — replaced by `production/start` (new) in Phase 6. |
| `studio/compose` | studio v1 | `compose-studio-video.ts` | **kept (renamed-only later)** — composition pipeline reused; the new production engine emits `production/compose` (net-new) so legacy in-flight jobs aren't disturbed. |
| `studio/assemble-audio` | studio v1 | `assemble-studio-audio.ts` | **kept (similar pattern)** — new engine emits `production/assemble-audio`. |
| `studio/generate-visuals` | studio v1 | `generate-segment-visuals.ts` | **kept (similar pattern)** — new engine emits `production/generate-visuals`. |
| `app/project.synthesize` | projects page | `synthesize-project.ts` | **deprecated** — replaced by macro-cluster synthesis in Phase 9. |
| `app/session.synthesize` | sessions page (legacy) | `synthesize-session.ts` | **drop with Sessions page deletion** in Phase 9. |
| `app/graph.synthesize` | brain page (legacy) | `synthesize-user-graph.ts` | **deprecated** — Graph view in Phase 7 derives from substrate directly, no synthesis pre-pass needed. |
| `manifest/voice-threshold-met` | upload pipeline | `trigger-voice-clone.ts` | **dormant** — voice clone is deprioritized per CLAUDE.md. |
| `manifest/face-threshold-met` | upload pipeline | `trigger-lora-training.ts` | **dormant** — LoRA training is deprioritized. |
| `manifest/refine-signal` | upload pipeline | `refine-signals.ts` | **dormant**. |
| `social/schedule-posts` | scheduler cron | `scatter-scheduler.ts` | **deprecated** — drops with `social_queue` table in Phase 9. |
| (cron `*/15 * * * *`) | Inngest scheduler | `postDispatcher` | **kept temporarily** — re-routed to `posts_v2` table in Phase 8. |
| (manual / scheduled) | admin UI | `reanalyze-all-uploads.ts` | **drop in Phase 9** — replaced by per-vlog opt-in re-extraction button. No bulk re-extraction. |
| (manual / scheduled) | admin UI | `backfill-recorded-at.ts` | **kept (locked)** — substrate function, do not touch. |

---

## Net-new events (filament-update rewrite)

All new events use distinct names that don't collide with any legacy event above.

### Phase 3 — extraction passes

| Event | Producer | Consumer | Purpose |
|---|---|---|---|
| `vlog/extract-threads` | `process-upload.ts` (after transcription) | `extract-threads.ts` (new) | Analytical pass → `threads` table |
| `vlog/extract-clip-candidates` | `process-upload.ts` (after transcription) | `extract-clip-candidates.ts` (new) | Clip-candidate pass → `clip_candidates` table |
| `vlog/extract-creative-elements` | `process-upload.ts` (after transcription) | `extract-creative-elements.ts` (new) | Creative-mode pass → `creative_elements` table |
| `vlog/reextract` | vlog detail page (operator-triggered) | `extract-threads.ts` + the other two passes | Per-vlog opt-in re-extraction. **Never bulk.** |

The three extraction passes fan out **in parallel** from `process-upload.ts` once transcription completes. They run **alongside** the existing legacy `analyze` step during transition; both old and new write paths are populated.

### Phase 4 — connection graph + clusters

| Event | Producer | Consumer | Purpose |
|---|---|---|---|
| `cluster/auto-link` | `extract-threads.ts` (after each thread write) | `cluster-auto-link.ts` (new) | Compare new thread's abstracted_topic against existing threads / clusters; add edges to `thread_connections`; auto-form or extend cluster; emit `Surfaced · Auto-link` card |
| `cluster/cultivate` | scheduled (every N hours) | `cultivate-clusters.ts` (new) | Sweep clusters in `forming` / `surfaced` / `ripening` states; recompute ripeness scores; transition state when threshold crossed |

### Phase 6 — production engine v2

| Event | Producer | Consumer | Purpose |
|---|---|---|---|
| `production/start` | studio v2 materialize action | `produce-cluster.ts` (new) | Generate form-specific script via ideator; create `productions_v2` row + `production_beats` rows |
| `production/coherence-check` | `produce-cluster.ts` (after script gen) | `coherence-check.ts` (new) | Haiku pass to flag LLM-default essay register before script reaches operator |
| `production/assemble-audio` | record screen v2 (all beats recorded) | `assemble-production-audio.ts` (new) | Stitch beat audio into final track |
| `production/generate-visuals` | `assemble-production-audio.ts` (after) | `generate-production-visuals.ts` (new) | Per-beat visual treatment (Lo-Fi: Flux stills only) |
| `production/compose` | `generate-production-visuals.ts` (after) | `compose-production-video.ts` (new) | FFmpeg composite via Replicate |

### Phase 7 — bounce, capture upgrades

| Event | Producer | Consumer | Purpose |
|---|---|---|---|
| `cluster/bounce` | cluster transitions to `ripening` | `bounce-cluster.ts` (new) | Web-search-augmented Sonnet call; populate `cluster_insights` with adjacent insights |
| `broll/vision-tag` | B-roll upload | `vision-tag-broll.ts` (new) | Vision model auto-tags B-roll asset (subject/location/mood/motion/time_of_day/lighting/color_palette/weather/season) |
| `attachment/extract-text` | attachment upload (PDF, image) | `extract-attachment-text.ts` (new) | OCR / PDF text extraction for searchability |

### Phase 8 — multi-output pipelines

| Event | Producer | Consumer | Purpose |
|---|---|---|---|
| `cluster/draft-x-post` | `Surfaced · Cluster ready` action | `draft-x-post.ts` (new) | Generate single x_post candidate from cluster |
| `cluster/draft-x-thread` | `Surfaced · Cluster ready` action | `draft-x-thread.ts` (new) | Generate x_thread (multi-post sequence) candidate |
| `cluster/draft-article` | `Surfaced · Cluster ready` action | `draft-article.ts` (new) | Crystal Ford voice profile is OUT OF SCOPE — uses Operator default |
| `posts/publish` | Timeline v2 Post-card publish action | re-routes to existing `/api/social/x/publish` | **No new Inngest function — uses existing X publish API endpoint unchanged.** |

### Phase 9 — macro-clusters, performance loop

| Event | Producer | Consumer | Purpose |
|---|---|---|---|
| `macro-cluster/synthesize` | scheduled | `synthesize-macro-cluster.ts` (new) | Group produced clusters with matching macro-abstracted_topic; emit synthesis-essay candidates |
| `production/measure-performance` | scheduled | `measure-production-performance.ts` (new) | Pull engagement metrics; attribute to `prompts.version` chain |

---

## Naming conventions

- **Pattern:** `<noun>/<verb>` lowercase kebab-case (matches existing convention).
- **No reuse** of legacy event names. Even if a new function does roughly what a legacy one did, the event gets a new name (e.g., `studio/produce` → `production/start`).
- **Per-table scoping** when ambiguous (e.g., `cluster/bounce` not `bounce` — makes it obvious which table the event operates on).
- **No nested namespaces beyond two levels.** `vlog/extract-threads` not `vlog/extraction/threads`.

---

## Deprecation discipline

When a legacy event is dropped in Phase 9:

1. The producer code that emits it is deleted first (in the PR that removes the corresponding surface).
2. The consumer Inngest function file is deleted in the same PR.
3. After the PR is in production for ≥48 hours with no regression, the event registration is removed from the Inngest dashboard manually.

This sequencing prevents in-flight jobs from being orphaned mid-deploy.
