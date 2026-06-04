# Neolog

A personal life graph and creative production system. The operator vlogs in real conditions and the system refracts those vlogs into threads, clusters, and multi-output productions (video essays, articles, X posts and threads, video clips).

The graph is the artifact. Productions are downstream.

---

## ⚠️ Operator environment — do not assume an IDE

The operator uses the **Claude Code desktop app on Windows**, not VS Code, not a terminal, not an IDE. This means:

- **The Claude Code session IS the operator's runtime.** When you run a bash command, you're running it on their machine. Treat this session as the deployment environment.
- **Never tell the operator to "open a terminal," "run a command locally," "pull the branch on your machine," or "edit a file in your editor."** They don't have any of those tools. You do all of that for them from this session.
- The operator can paste values in chat, click in browser dashboards, and toggle settings inside the Claude Code app. That's it. Anything else, you handle.
- Network access to external APIs (Cloudflare etc.) is controlled in Claude app: **Settings → Capabilities → "Allow network egress" + "Domain allowlist."** Required domains for this project: `*.cloudflare.com`, `*.cloudflareaccess.com`, `*.workers.dev`, `*.r2.cloudflarestorage.com`.
- The Cloudflare-side bootstrap (D1, Workers, Access, Containers, deploy) all runs from THIS session via `wrangler`, not from "the operator's machine." There is no separate machine.

---

## ⚠️ Locked architectural decisions — do not relitigate

These are settled. Read this section before proposing alternatives.

### Two vendors total: Cloudflare + Anthropic

| Vendor | What it provides |
|---|---|
| **Cloudflare** | Pages (hosting), R2 (video storage), D1 (database), Workers (backend), Workflows (async jobs), Queues, Workers AI (Whisper transcription), Access (auth), Containers (FFmpeg) |
| **Anthropic** | Claude (extraction, scripting, coherence-check) |

**Explicitly removed:** Supabase, Inngest, Groq, Replicate, OpenAI fallback, ElevenLabs, fal.ai, AssemblyAI. Do not reintroduce.

### Operator + project identity

- **Custom domain:** `neolog.ai`
- **GitHub repo:** `crystalford/neolog`
- **Cloudflare Account ID:** `eda2e9bbd9acc42699027cfdcb50f998`
- **Cloudflare Access team:** `neolog` (sign-in at `neolog.cloudflareaccess.com`)
- **R2 bucket:** `neolog-videos` (contains 11.67 GB of vlogs — the only data that must be preserved)
- **Single operator** (not multi-tenant). No multi-user logic, no team features.

### Data philosophy

- **Videos in R2 are the only thing preserved across rebuilds.** All other state (DB rows, configs, environments) is rebuildable.
- The old Supabase user_id prefix (`b2df4f26-6dd8-421d-bb3d-db777086079b/`) in R2 stays in place. New code reads videos from wherever they exist in the bucket — no migration, no renaming.
- Re-extraction of old vlogs is opt-in per vlog, never bulk.

### Operator product decisions

- **Voice profile:** "Operator default" only. No "Crystal Ford" profile, no character profiles in initial scope. Reference corpus auto-populated from the operator's longest 10 thread `key_quotes`. No hand-written cadence/register notes — iterate from output.
- **Production tier:** Lo-Fi only. No Hi-Fi unlock until operator asks.
- **Auth:** Cloudflare Access with one-time PIN to operator's email. No signup flow, no public account creation.
- **Upload archive mode:** uploads can land in `archived` status that skips auto-transcribe/analyze. Operator triggers processing per-vlog from the vlog detail page.

---

## ⚠️ Thumbnail pipeline — locks reversed, fast cascade now standard

Earlier rule was "transcode HEVC → H.264 **before** thumbnail extraction" because the old `/extract-thumb` returned 0 frames on DJI Mimo HEVC verticals due to rotation metadata. **That rule is reversed:** thumbnail extraction now runs FIRST (before transcode) using a three-tier cascade:

1. `/extract-thumb` direct with `-noautorotate` flag (~1-2 sec, works on most HEVC originals)
2. `/extract-thumb-mini-transcode` — 2-second H.264 re-encode then grab one frame (~5 sec, catches the rare files where rotation metadata still confuses ffmpeg)
3. After transcode completes, retry `/extract-thumb` on the transcoded output (only triggered if 1+2 both failed — extremely rare)

Total time on a fresh upload: ~2-5 seconds for thumbnail, even on HEVC vertical. The slow `transcode-h264` step still runs (for browser playback of HEVC sources) but no longer blocks thumbnail.

Thumbnails are written as static JPEGs to R2 at `{operator_id}/thumbs/{vlog_id}.jpg`, with the key stored in `vlogs.thumbnail_r2_key`. The API presigns 24-hour GET URLs and the client renders them as `<img loading="lazy">`. Browser handles caching via HTTP cache. (Also reversed the prior data-URI lock: 17 MB API responses + per-tile decoder pressure on /uploads made data URIs worse than the signed-URL-expiry they were avoiding. The legacy `thumbnail_url` data-URI column is still read by the API for backward compat with old rows; no migration of those rows.)

The new architecture moves this from Replicate to Cloudflare Container Workers running FFmpeg.

## ⚠️ DO NOT CHANGE — Recording date pipeline

Four-tier fallback for `recorded_at`: pre-extracted date (client filename inference) → MP4 mvhd atom → server-side filename regex → upload time. The mvhd extraction uses MP4 epoch offset 2082844800 with v0/v1 branch handling.

The shared implementation lives in `src/lib/recorded-at.ts` and runs **synchronously inside the registration API** (`src/app/api/v2/vlogs/route.ts` POST) so the row is INSERTed with `recorded_at` + `recorded_at_source` already set — independent of any downstream workflow failure. The post-upload workflow keeps `extract-recorded-at` as a safety net for archived imports.

Filename regex must cover at minimum these patterns (server-side, in order):
- `YYYY-MM-DDTHH:MM:SS` / `YYYY-MM-DD_HH-MM-SS`
- `YYYYMMDD_HHMMSS`
- `YYYYMMDDTHHMMSS` (ISO compact)
- `YYYYMMDDHHMMSS` (14 consecutive digits — DJI Mimo: `DJI_20260401110554_0055_D.MP4`)
- `YYYY-MM-DD`
- `YYYYMMDD`

## ⚠️ DO NOT CHANGE — Workflow resilience

Each post-upload step (transcode, thumbnail, recorded_at, transcribe, the four extraction passes) runs inside a `softStep()` wrapper in `workers/process-upload/src/workflow.ts`. The wrapper:
- Catches retry-exhausted failures and records them in `vlogs.extraction_outcomes` JSON instead of aborting the workflow.
- Lets every feature stand on its own — a flaky transcode no longer takes thumbnail + recorded_at + transcribe + extract down with it.
- Keeps the existing `step.do` retry behaviour intact (each step still gets 2-3 retries before giving up).

The `extraction_outcomes` column is the source of truth for "what worked, what failed" — read it from D1 instead of scrolling the Cloudflare dashboard.

## ⚠️ DO NOT CHANGE — Pages project bindings

The `@cloudflare/next-on-pages` adapter does **not** read `[[services]]` / `[[d1_databases]]` / `[[r2_buckets]]` from the root `wrangler.toml`. Pages projects under that adapter take their bindings from the project's `deployment_configs`, which the bootstrap workflow sets via the Cloudflare REST API (`.github/workflows/bootstrap-cloudflare.yml` → step "Wire Pages project bindings"). Without that step, `env.PROCESS_UPLOAD` and `env.FFMPEG` are undefined on the deployed app and the post-upload workflow never dispatches.

## ⚠️ Podcast feed — in-house RSS, no third party

The system has its own podcast feed at `/podcast.xml` (RSS 2.0 + iTunes
namespace). Per-vlog opt-in via `vlogs.is_podcast` (toggle on `/vlog/[id]`,
independent of `visibility` so you can keep audio-only quick takes off the
public web but inside the podcast). Audio enclosure points at
`/podcast/audio/{vlog_id}.mp3` which 302-redirects to a presigned R2 URL of
the stitched MP3 at `{operator}/audio/{vlog_id}/mp3.full`.

For audio-only uploads the pipeline calls FFmpeg `/concat-audio` after
transcribe to stitch the browser-uploaded WAV chunks into the canonical
mp3.full. For video uploads, `stepAudioExtract` already produces mp3.full
as part of normal ingestion.

Cloudflare Access exclusion is handled by two extra bypass apps in the
bootstrap workflow — `neolog.ai/podcast.xml` and `neolog.ai/podcast/audio`.
Podcast clients fetch without auth; the rest of the site stays operator-only.

## ⚠️ NO CAPTIONS OR TEXT OVERLAYS — ever

These are documentary / short film / video essay productions. **Never add captions, subtitles, or text overlays to video output.** No burned-in text, no SRT files, no caption tracks, no lower thirds. The visual track is purely cinematic. The audio carries the narration.

---

## Surfaces — what actually shipped

The masthead is a **top-horizontal nav** (no sidebar, no bottom dock — the prototype HTML files in this repo's git history described a phone-frame mobile design but were dropped in favor of the editorial top-nav design pasted in chat at `/tmp/neolognextlevel/design-reference/*.html`).

**Primary nav (7 entries, left to right):**

| Label | Route | What it is |
|---|---|---|
| **Timeline** | `/` | The home FYP. Day-banded feed of vlogs, threads, posts, clips, surfaced cards. Public-mode variant when unauthed (productions only). Filter pills (vlog/thread/post/surfaced). |
| **Inbox** | `/inbox` | Triage queue. Surfaced cards + ripening clusters + worth-shipping threads + hot topics + processing vlogs + failed vlogs + drafts in progress. The system's outbox to the operator. |
| **Vlogs** | `/vlogs` | Raw archive — every recording. Inline `CapturePanel` for new uploads via "Drop new vlogs" toggle. Filter strip + bulk select. Capture lives here, not as a separate route. |
| **Clusters** | `/studio` | Cultivation surface. Cluster list + detail. Operator notes/quotes/references can be added to shape direction. Detail page has ripeness gauge + breakdown bars + trajectory chart + riff timeline + bounce panel + member threads + production candidates. URL stays `/studio` for backward-compat; nav label is "Clusters". |
| **Productions** | `/productions` | Unified feed of project containers (Pack Rats-style, from `projects` table) AND draft productions (from `productions` table — scripts/clips/articles/x-threads/x-posts/video-essays). |
| **Chat** | `/chat` | In-app assistant. Llama 3.3 70B in-house default, Kimi K2.6, Claude Sonnet as opt-in `max`. Split-pane sessions list + conversation. |
| **About** | `/about` | The system, mapped — four principles + six surface tiles. |

**Outside the masthead:**
- **Settings** (`/settings`) — operator card + 6 sections (Identity / AI models / API keys / Integrations / Storage / Pipeline). System health folded in.
- **Signin** (`/signin`), **Onboarding** (`/onboarding`) — minimal chrome, no masthead. Cloudflare Access one-time-PIN.
- **Public production view** (`/p/[id]`) — unauthed, minimal chrome. Cobalt/black palette.

**Detail pages** (reached from list pages, not nav entries directly): `/thread/[id]`, `/vlog/[id]`, `/studio/[id]`, `/production/[id]` (the draft view), `/productions/[id]` (project containers), `/entity/[id]`.

**Old paths that redirect:**
- `/clusters` → `/studio` · `/cluster/[id]` → `/studio/[id]`
- `/timeline/[id]` → `/vlog/[id]`
- `/projects` → `/productions` · `/projects/[id]` → `/productions/[id]`
- `/console` → `/chat`
- `/capture` → `/vlogs?capture=open` · `/uploads` → `/vlogs`
- `/library` → `/productions` · `/transcript` → `/?filter=thread` · `/states` → `/` · `/post` → `/productions`
- `/clip/[id]` → `/thread/[id]` · `/article/[id]` → `/productions` · `/attachment/[id]` → `/` · `/broll/[id]` → `/vlog/[id]`
- `/landing` → `/` · `/[handle]` → `/`

The ⌘K palette + Graph nav entry were both removed (operator: "I have no idea what that is" / "[Graph] is useless"). The `/graph` route still resolves so entity-chip deep links work, but it's not a nav destination.

---

## Design vocabulary — applied uniformly

Pure black bg (`#000`), cool-gray fgs, cobalt signal `#5b8df6` (NOT the old warm orange). Ten topic territories (brass / terra / ochre / rose / plum / violet / steel / teal / sage / moss). Geist (300-700) + JetBrains Mono (300-600).

**Type scale**: hero h1 ~ 56-92px weight 300-400 with `letter-spacing -2 to -4px`. Eyebrows: 10.5px JetBrains Mono `letter-spacing 3.2px` uppercase. Sub: 18px. Body: 14-16px.

**Every detail page must answer the four principles** from `00-Sitemap.html`:
1. The work itself (full-res audio / video / transcript / draft)
2. Where it came from (parent vlog, source threads, model, prompt version)
3. Where it sits (cluster context, siblings, related, entity neighborhood)
4. What it became (productions that used the material, gaps, what's next)

Reference HTMLs at `/tmp/neolognextlevel/design-reference/*.html` (8 files). The codebase doesn't re-export them — they're build references, not runtime assets.

---

## Production engine

Six production types working end-to-end:

| Source | Type | Pipeline |
|---|---|---|
| Thread | **x_post** | LLM (default Llama 70B) drafts ≤270 chars, voice-preserved. Editor on `/production/[id]`. |
| Thread | **micro_essay** | LLM drafts 300-450 words. Editor. |
| Thread | **clip** | FFmpeg slices parent vlog at `transcript_span_start..end`. No LLM. Renders as `<video>` on detail page. R2-cached at `{operator}/video-segments/{thread_id}.mp4`. |
| Cluster | **x_thread** | LLM drafts 4-7 connected posts separated by `---`. Editor. |
| Cluster | **article** | LLM drafts 900-1400 words. Editor. |
| Cluster | **video_essay** | LLM drafts ~1500-2200 word script broken into 6-12 BEATS (separated by `===`). Beats stored in `production_beats` table. Per-beat browser-MediaRecorder voiceover → R2 → FFmpeg `concat-audio` stitches into single MP3 → b-roll picker (vlogs with `pipeline_status='archived'`) → FFmpeg `render-video-essay` produces final MP4 (scale-to-1920×1080 normalize + concat + `-shortest` to voiceover length). |

**State machine**: `materializing → script_ready → recording → producing → produced → published`. Operator can flip `visibility='public'` → served at `/p/[id]`.

**Re-generate** wired (`POST /api/v2/productions/[id]/regenerate`). Bumps `script_version`. For video_essay, wipes + re-parses beats (warning before discarding recordings).

**Default model: Llama 70B (in-house Workers AI)**. Sonnet opt-in via picker on the ProduceModal + EngineCard. Kimi K2.6 is the middle option.

---



## The three extraction passes

Every ingested vlog runs three parallel passes after transcription, plus entity extraction. The **tier** (set per vlog from the vlog detail page, default `free`) picks the LLM provider for each pass:

| Pass | Output table | `free` (default) | `premium` | `max` | Purpose |
|---|---|---|---|---|---|
| Analytical | `threads` | Llama 3.3 70B | **Sonnet 4.6** | Sonnet 4.6 | topic / take / key_quotes / register / strength / abstracted_topic |
| Creative-mode | `creative_elements` | Llama 3.3 70B | **Sonnet 4.6** | Sonnet 4.6 | Fictional / creative material for projects |
| Clip-candidate | `clip_candidates` | Llama 3.3 70B | Llama 3.3 70B | **Sonnet 4.6** | Delivery moments where the operator nailed a segment |
| Entity | `entities` / `entity_mentions` | Llama 3.3 70B | Llama 3.3 70B | **Sonnet 4.6** | People, places, projects, tools, concepts, themes |

**Cost per 20-min vlog:** `free` ~$0.04 · `premium` ~$0.10 · `max` ~$0.17. The vlog detail page shows the estimate before any re-run.

**Workers AI model options** (operator chooses in Settings):
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — **default**. Dense flagship. Used for extraction (`free` tier, all 4 passes) and chat by default. Best writing quality of the open Workers AI models. Exported as `LLAMA_70B` in `src/lib/llm.ts`. Wired into `callLlama70B` in `src/lib/extract-unified.ts`.
- `@cf/moonshotai/kimi-k2.6` — picker option. Closest-to-Claude voice. 1T MoE / 32B active, 262K context, agentic-tuned. Pricier than 70B with similar quality on writing tasks, so left as opt-in.
- `@cf/meta/llama-4-scout-17b-16e-instruct` — picker option. Cheapest + multimodal (text + image native), MoE 17B active, 131K context. Lower writing quality.

**Per-pass re-extract** is supported — the API accepts `passes: ['threads']` (or any subset) so the operator only pays for the pass they're iterating on. Other passes' rows stay intact.

**Transcription** is always Workers AI Whisper (whisper-large-v3-turbo) — essentially free at single-operator scale (~$0.005 per 20-min vlog). A future per-vlog Claude transcription override will live on the same vlog detail page for cases where Whisper struggles (heavy accent, music underneath, etc).

Every extraction call loads its prompt from the `prompts` table by `(name, is_active=true)`. Every output row carries the `extraction_prompt_version` it was produced under. **Iterate prompts on incoming vlogs as they arrive** — no gold set, no batch re-runs. When a take is sanitized or a topic boundary is wrong, the operator flags it in Timeline; the prompt updates as a new `prompts.version` row.

**Voice preservation hard rule:** each thread's `take` and at least one `key_quote` must contain a verbatim 4+ word substring from the source transcript. Failed runs log and skip the write — do not corrupt the table with sanitized voice.

---

## Riff detection

The clustering engine's primary job is recognizing **riffs** as they form — runs of 3 to 20 vlogs over a short timeframe all circling the same underlying thing from different angles. Auto-link is enabled day one with a conservative confidence threshold (starts at 0.85 cosine on embeddings or strict abstracted_topic equality, operator-tunable in Settings). Every auto-link emits a `Surfaced · Auto-link` card with manual unlink. Transparency comes from these cards, not from gated approval.

A future agent who tries to make clustering "smarter" by surfacing hidden cross-thread connections before solving riff-recognition is solving the wrong problem. Riff-first, cross-riff second.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router |
| Runtime | Cloudflare Workers / Pages Functions |
| Hosting | Cloudflare Pages |
| Package manager | **pnpm** — Cloudflare build uses `pnpm install --frozen-lockfile` |
| Database | Cloudflare D1 (SQLite) |
| Video storage | Cloudflare R2 (bucket: `neolog-videos`) |
| Uploads | Multipart direct to R2 via presigned URLs |
| Async jobs | Cloudflare Workflows |
| Transcription | Cloudflare Workers AI Whisper |
| AI (chat) | **Llama 3.3 70B** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) on Workers AI by default — best writing quality of the open Workers AI models. **Kimi K2.6**, **Llama 4 Scout**, and Claude `claude-sonnet-4-6` are picker options in the chat header. Default model is operator-configurable in Settings. |
| AI (extraction) | Llama 3.3 70B on Workers AI (`free` tier, default — all 4 passes) or Claude Sonnet 4.6 (`premium` / `max`). See the three-pass table below. Default tier is operator-configurable in Settings. |
| Video processing | Cloudflare Container Workers running FFmpeg |
| Auth | Cloudflare Access (one-time PIN to operator email) |
| Styling | Inline styles importing tokens from `src/lib/design.ts` |

---

## Design system — bone/ink/Geist + topic territories

Cinematic warm dark. Bone-on-ink. Geist body, JetBrains Mono for metadata only.

**Tokens live in `src/lib/design.ts`.** Import from there; do not redefine inline.

```typescript
import { INK, BONE, TOPIC, STATE, FONT_BODY, FONT_MONO } from '@/lib/design'
```

Ten topic territory colors: brass, terra, ochre, rose, plum, violet, steel, teal, sage, moss. Three rotating logo marks per session: Aperture, Stratum, Filament.

---

## Database (Cloudflare D1)

Single schema, written fresh in `db/schema.sql` from the filament-update spec. No legacy tables. No `_v2` suffixes (nothing to coexist with).

Active tables: `operator`, `vlogs`, `transcript_words`, `threads`, `creative_elements`, `clip_candidates`, `entities`, `entity_mentions`, `thread_connections`, `clusters`, `cluster_threads`, `cluster_insights`, `bounce_runs`, `macro_clusters`, `macro_cluster_members`, `productions`, `production_beats`, `production_visual_assets`, `motifs`, `production_motifs`, `projects`, `characters`, `surfaced_cards`, `posts`, `extraction_runs`, `prompts`, `pipeline_jobs`, `broll_assets`, `attachments`, `voice_profiles`.

**No RLS** — D1 doesn't have it. Single-operator app, every query filters implicitly by operator identity from Cloudflare Access JWT.

---

## Credentials are documented in `docs/CREDENTIALS.md`

**Do not ask the operator to "verify" or "re-add" R2 keys, API tokens, account IDs, or any other credential without first reading `docs/CREDENTIALS.md`.** Every credential listed there is confirmed working and propagated to the right places by the bootstrap workflow. When something fails: debug code first, credentials last.

## Key env vars (in `.env.local`, plus Cloudflare Worker secrets)

```
# Cloudflare bootstrap (one-time, then revoke)
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID="eda2e9bbd9acc42699027cfdcb50f998"
CLOUDFLARE_ACCESS_TEAM="neolog"
CLOUDFLARE_R2_BUCKET="neolog-videos"

# Anthropic — the only third-party API key the running app needs
ANTHROPIC_API_KEY

# Set as Worker secrets via `wrangler secret put` at deploy time, not in .env.local at runtime
```

---

## Inngest events → Cloudflare Workflows

All async work runs as Workflows. Workflow IDs:

- `process-upload` — transcribe + extract pipeline
- `extract-threads`, `extract-clip-candidates`, `extract-creative-elements` — three parallel extraction passes
- `cluster-auto-link`, `cluster-cultivate`, `cluster-bounce` — clustering + bounce
- `production-start`, `production-coherence-check`, `production-assemble-audio`, `production-generate-visuals`, `production-compose` — production engine
- `vision-tag-broll`, `extract-attachment-text` — capture-side
- `macro-cluster-synthesize`, `measure-production-performance` — meta-synthesis + perf

---

## Rules for Claude

- **Always update this document** when a feature is built, a decision is made, or priorities change. Same commit.
- Two vendors only: Cloudflare and Anthropic. Refuse to reintroduce Supabase / Inngest / Replicate / etc. — say so explicitly if the operator asks.
- Use `claude-sonnet-4-6` for AI features that do real work; `claude-haiku-4-5` for cheap classification and coherence-check.
- `export const runtime = 'edge'` on every Next.js route + page.
- Never hardcode API keys — Anthropic key is a Worker secret; resolved via `env.ANTHROPIC_API_KEY` in Workers.
- New pages: import design tokens from `src/lib/design.ts`. Inline styles only.
- Never route file uploads through API routes (large files go direct to R2 via presigned URLs).
- Do not preserve the 49-field extraction schema. The thread-based replacement is the only forward path.
- Do not sanitize voice in extraction outputs. Profanity, hesitations, fragmentary phrasings stay. The hard 4-word verbatim check enforces this.
- Do not generate scripts from thread takes only — the ideator must receive full source vlog transcripts alongside the cluster object.
- Do not put the operator at the center of video essay scripts. The operator's vlogs identified the topic; the script is *about* the topic, not about the operator's experience of it.
- Do not auto-publish without operator review. Publish surface is operator-gated.
- Do not introduce camera-on production paths in current scope. Future product.
- Do not build the tier picker UI until operator asks — Lo-Fi only.
- Do not bulk re-extract old vlogs. Re-extraction is opt-in per vlog.
- Do not propose pg_dump / RLS / Supabase patterns — they don't exist here anymore.

---

## What the operator does after I push

**The operator does NOT have a terminal.** They're on the Claude Code Windows app. There is no `git pull`, no `pnpm run bootstrap`, no local wrangler. Anything that needs to run on a real machine runs on **GitHub Actions** — specifically `.github/workflows/bootstrap-cloudflare.yml`.

The bootstrap workflow:
- Auto-triggers on every push to `main`
- Can be manually re-run from the GitHub Actions tab (https://github.com/crystalford/neolog/actions → "Bootstrap Cloudflare" → "Run workflow")
- Reads credentials from GitHub repo secrets (already configured — see `docs/CREDENTIALS.md`)
- Provisions D1, R2, Workers, Workflows, Container, Access, Pages bindings, and deploys — idempotent, safe to re-run

The operator's role after a push: wait for the Actions run to finish (or manually re-trigger if I didn't push a code change), then sign in via Cloudflare Access. That's it. Never tell them to run anything locally.

---

## Help

- /help: Get help with using Claude Code
- To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues
