# Neolog

**An AI video-essay studio you talk into.** Three doors into making something:

- **Subjects** — concepts the system finds you keep circling in your own recordings, *named for you* (often using terms-of-art you didn't have a word for). You make essays about your own mind.
- **Topics** — anything you want to make a video about, regardless of whether you've recorded about it. The system researches the topic via Cloudflare Browser Run, drafts a script in your voice, ready to record.
- **Spark** — type one thought; get a 30–60 second vertical short ready to post. The "learn by creating" loop.

Every output is written in your voice. Two layers learn you: **how you write** (cadence, register, intellectual moves — `voice-shape`) and **what you care about** (recurring fascinations, the lens you bring — `operator-profile`). Both refresh automatically from your past vlogs. **After your first batch of recordings you can stop uploading entirely** — your existing corpus is voice training forever, and the open web supplies any new substance.

The whole pipeline runs on Cloudflare. Workers AI for every model (Llama / gpt-oss / Flux / Wan 2.7 / Grok Imagine / MiniMax cloning / Aura-2 / Whisper). R2 for storage. D1 for state. FFmpeg in a Container Worker for final render. One bill, no third party (Brave Search is optional, for web research).

> *Earlier doc versions called this "a personal life graph" with a 7-entry nav (Timeline / Inbox / Vlogs / Clusters / Productions / Chat / About). That earlier vision still exists as routable URLs — bookmarks don't break — but the product has refocused. See the **Surfaces** section for the actual current shape.*

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

The masthead is a **top-horizontal nav, four primary entries**. *"The mess goes quiet; the work stays loud."*

| Label | Route | What it is |
|---|---|---|
| **Subjects** | `/subjects` | **Home.** Named concepts the librarian surfaced from your vlogs — themes, tensions (you said X then said the opposite), evolutions (your view matured), open-loops (questions you keep returning to), candidates (sharp one-offs). Each card → Make the script · Make a post · Pull clips · Make a short. |
| **Topics** | `/topics` | Type any subject (a person, an idea, a fascination). The **Spark composer** sits at the top — type one thought, get a 30–60s short ready to post. Below it, the new-topic form for full essays. Topic detail page generates angle suggestions from your operator profile, researches sources via Cloudflare Browser Run, and drafts the script in your voice. |
| **Vlogs** | `/vlogs` | Raw archive of recordings. Inline `CapturePanel` for new uploads (four modes: full / compressed / slideshow / audio-only — the bad-wifi ladder). Filter strip + bulk select. |
| **Published** | `/published` | The accumulating body of work — only productions in `state='published'`. Honest signal if empty. |

**Detail pages** (reached from list pages, not nav directly):
- `/subjects/[id]` — one subject + all evidence + deliverables (script / post / clips / short).
- `/subjects/[id]/skeleton` — **the skeleton-first script flow.** Operator approves the beat structure before any prose is written; the model fills in.
- `/topics/[id]` — angle suggestions, pasted/auto-found sources, editable research brief, build the script (long or short).
- `/vlog/[id]` — one vlog. Includes the **in-podcast toggle**.
- `/production/[id]` — draft production. Edit script, record voiceover per beat (or **synthesize via your cloned voice**), generate AI b-roll per beat (Flux + Wan, optional Grok Imagine direct-video with audio), render to MP4.
- `/productions/[id]` — project containers (Pack Rats-style).
- `/p/[id]` — public production view (no auth).

**Settings** (`/settings`) — operator card + sections: Identity · AI models (Llama 3.3 70B is the current default — *not* Kimi, despite earlier docs) · **Your voice** (record 10 seconds → MiniMax 2.8 clones it for synth; or pick an Aura-2 preset) · API keys (incl. optional **Brave Search key** for Topics auto-search) · Integrations · Storage · Pipeline.

**Secondary surfaces — still functional, no longer in primary nav** (avatar dropdown is the discoverable path going forward):

| Surface | Route | Status |
|---|---|---|
| **Studio** (clusters/cultivation) | `/studio` + `/studio/[id]` | Fully functional. Ripeness gauge, riff timeline, bounce panel, insight CRUD. Subjects is the new default but Studio remains the deeper cultivation surface. |
| **Inbox** (triage) | `/inbox` | Fully functional. Failed vlogs, ripening clusters, drafts, surfaced cards. Useful for "what needs my attention." |
| **Chat** | `/chat` | Fully functional in-app assistant with tool calls into your corpus (search vlogs, fetch threads/clusters, draft posts). |
| **Timeline** (the old FYP) | `/timeline` redirects to `/` | Still routes; not a destination. |
| **About** | `/about` | System explanation. Linked from avatar dropdown. |
| **Podcast feed** | `/podcast.xml` | **Fully built RSS 2.0 + iTunes namespace feed.** Per-vlog `is_podcast` toggle on `/vlog/[id]` controls inclusion. Public bypass on Cloudflare Access for podcast clients. Linked from Settings → Integrations. |
| **Entity hubs** | `/entity/[id]` + `/graph` | Routes resolve so entity-chip deep links work. No primary nav entry; this is intentional. |
| **System / health** | `/system` | Debug/health surface. Reach via Settings if needed. |

**Old paths that redirect:**
`/clusters` → `/studio` · `/cluster/[id]` → `/studio/[id]` · `/timeline/[id]` → `/vlog/[id]` · `/projects` → `/productions` · `/console` → `/chat` · `/capture` → `/vlogs?capture=open` · `/uploads` → `/vlogs` · `/library` → `/productions` · `/transcript` → `/?filter=thread` · `/states` → `/` · `/post` → `/productions` · `/clip/[id]` → `/thread/[id]` · `/article/[id]` → `/productions` · `/attachment/[id]` → `/` · `/broll/[id]` → `/vlog/[id]` · `/landing` → `/` · `/[handle]` → `/`.

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

## The "knows me" layer — voice + interests, injected into every prompt

Two primitives, both refreshed automatically when the librarian runs (or manually from the Subjects rebuild button). Both inject a tight prompt block into *every* generator that produces material — angle suggestions, research briefs, scripts, spark seeds.

| Primitive | File | Teaches the model |
|---|---|---|
| **voice-shape** | `src/lib/voice-shape.ts` | **How you write** — pulls 6 strength-varied, register-diverse takes WITH their verbatim transcript spans. The block is explicit: STYLE EXAMPLES ONLY — never copy the content of these samples; what they teach is the substrate of your cadence. |
| **operator-profile** | `src/lib/operator-profile.ts` | **What you care about** — a 4–8 sentence second-person digest synthesized by gpt-oss-120b from your named subjects + 15 strongest recent takes, plus the top 14 librarian subjects as surface texture. Stored on `operator.profile_digest`; rebuilt cheap (~5s, medium effort) after every librarian run. |

The third helper, **spark-seeds** (`src/lib/spark-seeds.ts`), generates 5–8 short-form concept hooks for the Spark composer, drawn from the profile + subjects. Cached on `operator.spark_seeds_json`. Auto-rebuilt on librarian completion alongside the profile.

These three are the answer to "can it know me?" — they're the substrate of the *extension of brain* framing. After a single librarian pass over your 300 vlogs, every prompt the system runs is shaped by your mind.

---

## Production engine

Seven production types working end-to-end. The orchestration is the same — script generation → optional voice (recorded or synthesized) → optional b-roll → render or copy:

| Source kind | Type | Pipeline |
|---|---|---|
| thread | **x_post** | LLM drafts ≤270 chars, voice-preserved. Editor on `/production/[id]`. Copy & ship. |
| thread | **micro_essay** | LLM drafts 300-450 words. Editor. |
| thread | **clip** | FFmpeg slices parent vlog at `transcript_span_start..end`. No LLM. R2-cached at `{operator}/video-segments/{thread_id}.mp4`. |
| cluster | **x_post** | Subject → ≤270 char post. |
| cluster | **x_thread** | LLM drafts 4-7 connected posts separated by `---`. |
| cluster | **article** | LLM drafts 900-1400 words. |
| cluster | **video_essay** | **The full Studio flow.** Skeleton-first (see below) → prose → per-beat voiceover (recorded OR synthesized via MiniMax clone / Aura-2 preset) → AI b-roll per beat → FFmpeg render to 16:9 MP4. |
| topic | **video_essay / article / x_thread / micro_essay** | Topic → research brief → script in your voice. |
| topic / cluster / thread | **short** | **The Spark mode.** 30–60s, 1–3 beats, single concept. Render is 9:16 vertical. Voice **auto-synthesizes** on creation if a voice profile is set — by the time you land on the production page the voiceover is on its way. |

**The skeleton-first script flow** (`/subjects/[id]/skeleton` and the topic Build button): the system proposes a beat skeleton (5–9 beats, each with kind / title / anchor moment / one-line directive) BEFORE any prose. Operator reorders, swaps anchors, edits directives, re-proposes, then **Lock & write** runs the prose generator against the *locked* skeleton — the model can no longer drift the structure, only fill it in.

**The AI b-roll pipeline** (per beat — `src/lib/broll.ts`):
1. gpt-oss-120b writes a cinematic image prompt (rules: layered composition, no faces, no logos, no clichés like "gavel-for-law", subtext over text).
2. Flux 1 Schnell generates a still (1024² for 16:9; 720×1280 for 9:16 shorts).
3. Wan 2.7 image-to-video animates the still (2–15s clip). Falls back to FFmpeg Ken Burns if Wan errors.
4. **Alternate path per beat:** Grok Imagine Video for direct text-to-video with synchronized native audio.

**State machine**: `materializing → script_ready → recording → producing → produced → published`. The flag `visibility='public'` serves the production at `/p/[id]` (separate from podcast/ship state).

**Default LLM model: Llama 3.3 70B** for extraction; **gpt-oss-120b** (Workers AI) for hard reasoning (librarian, angle suggestions, scripts). Claude Sonnet 4.6 is the paid opt-in. The model registry lives at `src/lib/models.ts`.

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

## Subject detection — the librarian

The Subjects screen is built by **the librarian** (`src/lib/librarian.ts`). Not embeddings cosine. Not abstracted_topic string-match. A real two-pass LLM read of the operator's takes, looking for the underlying CONCEPT — including terms-of-art the operator may not have used themselves (*"you keep describing the principal-agent problem"*).

**Pass 1 — theme grouping.** gpt-oss-120b at high effort reads the operator's top topic-keys (up to 200 distinct keys) plus the verbatim transcript spans of the 25 strongest takes (so the model sees PRIMARY MATERIAL, not summaries-of-summaries). Hard rules in the prompt: REJECT generic life-area labels (no "Personal Growth", "Mental Health", "Time Management", "AI and Technology", anything joined by "and" linking two domains). If the verbatim doesn't support a real concept name, omit the subject rather than ship a category header. Sharp one-offs are allowed through with `subject_kind='candidate'` and a "said once" badge.

**Pass 2 — tensions / evolutions / open-loops.** A second model pass reads the operator's substantive takes oldest-first with date + kind tags, looking for:
- **Tensions** — two moments where the operator took opposing positions on the same idea ("On May 12 you said X; on June 2 the opposite").
- **Evolutions** — a directional shift (their view matured/moved over time).
- **Open loops** — a question they keep returning to, unresolved.

Each gets its own subject (`subject_kind='tension'|'evolution'|'open_loop'`) with `pole_a` / `pole_b` (and dates) when applicable. These render with distinct colored borders and a side-by-side PoleBox comparison. They **sort to the top** of the Subjects screen — they're the sharpest essay seeds.

**Schema**: subjects live in the existing `clusters` table with `subject_source='librarian'`, plus columns `subject_kind`, `pole_a`, `pole_b`, `pole_a_at`, `pole_b_at`, `framing`, `concept_confidence`, `named_by_system`, `representative_quote`. The legacy string-match clusterer (`/api/v2/admin/build-clusters`) still exists for backward-compat but is no longer the default path.

**Auto-refresh**: GET `/api/v2/subjects` fires a background rebuild via `ctx.waitUntil()` when ≥5 new threads landed since the last librarian pass. The operator never has to think about freshness; visit the page, get the latest.

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
| Uploads | Multipart direct to R2 via presigned URLs (four CapturePanel modes: full / compressed / slideshow / audio-only) |
| Async jobs | Cloudflare Workflows + Durable Object pipeline |
| Transcription | Cloudflare Workers AI Whisper (`whisper-large-v3-turbo`) |
| **Hard-reasoning LLM** (librarian, scripts, angles) | **`@cf/openai/gpt-oss-120b`** with `reasoning: { effort: 'low'\|'medium'\|'high' }`. Auto-fallback to Llama 3.3 70B on error. Wired via `callReasoning()` in `src/lib/models.ts`. |
| Extraction LLM | Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for `free` tier; Claude Sonnet 4.6 for `premium` / `max`. |
| Chat default | Llama 3.3 70B. Picker also exposes Kimi K2.6, Llama 4 Scout, Claude. |
| Image generation (b-roll stills) | `@cf/black-forest-labs/flux-1-schnell` — base64 JPEG, 8-step rectified flow |
| Image-to-video (b-roll animation) | `@cf/alibaba/wan-2.7` — 2–15s clip from a still + motion hint. FFmpeg Ken Burns is the automatic fallback. |
| Text-to-video with synced audio | `@cf/xai/grok-imagine-video` — alternate per-beat path; produces clips with ambient sound natively |
| TTS — voice cloning | `@cf/minimax/speech-2.8-turbo` — clones operator's voice from 10s reference. Operator records once via Settings → Your voice. |
| TTS — preset voices | `@cf/deepgram/aura-2-en` — 40 preset voices. Used when cloning isn't chosen, and as auto-fallback. |
| Web research (Topics) | **Cloudflare Browser Run** `/crawl` endpoint for source fetching → markdown. Optional Brave Search API (free tier covers ~2000 queries/month) for auto-finding sources from the topic + angle. |
| Video processing / render | Cloudflare Container Worker running FFmpeg (`workers/ffmpeg`) — transcode, thumb, audio extract, video-essay render (16:9 or 9:16), Ken Burns |
| Auth | Cloudflare Access (one-time PIN to operator email). Public bypass apps for `/p/*` and `/podcast.xml` + `/podcast/audio/*`. |
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

Schema is `db/schema.sql` + the runtime migrations in `src/lib/migration-runner.ts`. Migrations run on first request per Worker isolate; safe to redeploy without manual steps.

**Active core tables:**
- **Identity**: `operator` (+ `voice_profile_r2_key`, `voice_synth_mode`, `voice_synth_voice_id`, `profile_digest`, `spark_seeds_json`, `brave_search_api_key`).
- **Vlogs + transcripts**: `vlogs` (+ `audio_chunks_json`, `slideshow_frames_json`, `is_podcast`), `transcript_words`, `attachments`, `broll_assets`.
- **Extraction outputs**: `threads` (+ `utterance_kind` for arc-building), `creative_elements`, `clip_candidates`, `entities`, `entity_mentions`, `thread_connections`, `extraction_runs`, `prompts`.
- **Subjects / clusters** (same table): `clusters` (+ `subject_source`, `subject_kind`, `pole_a/b`, `pole_a/b_at`, `framing`, `concept_confidence`, `named_by_system`, `representative_quote`), `cluster_threads`, `cluster_insights`, `bounce_runs`.
- **Topics**: `topics` (+ `research_brief`, `research_status`, `pasted_urls_json`, `suggestions_json`), `topic_sources`.
- **Productions**: `productions` (+ `aspect`, `render_status`, `reasoning_skeleton_json`, `skeleton_locked`), `production_beats` (+ `broll_image_r2_key`, `broll_video_r2_key`, `synth_audio_r2_key`, `synth_voice_id`), `production_visual_assets`, `projects`, `posts`, `surfaced_cards`.
- **Chat**: `chat_threads`, `chat_messages`, `chat_attachments`, `operator_settings`, `background_jobs`, `pipeline_events`, `pipeline_jobs`, `schema_migrations`.
- **Voice**: `voice_profiles` (the table is still here; the actively-used columns live on `operator` per the synth flow).

**Stub tables — known dead, do not extend without an operator decision:**
- `macro_clusters`, `macro_cluster_members` — cross-cluster synthesis from the earlier vision; zero code references. Decide before resurrecting: do you want cross-subject macros, or has the librarian's tension/evolution detection replaced that need?
- `motifs`, `production_motifs` — pattern recognition from the earlier vision; zero code references.
- `characters` — table exists; UI never built. `voice_profiles.kind='character'` is the production mechanism if/when character voices come into scope.

**No RLS** — D1 doesn't have it. Single-operator app; every query filters by operator identity from the Cloudflare Access JWT.

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

## Library code map (`src/lib/`) — where things actually live

If you're looking to add or change a generator/pipeline step, start here. **Do not** rebuild what's already in one of these files.

| File | Purpose |
|---|---|
| `models.ts` | **The unified LLM abstraction.** Model registry (`MODELS.HARD = gpt-oss-120b`, `MODELS.IMAGE = flux-1-schnell`, etc.); `callReasoning()` for hard tasks (with Llama 70B auto-fallback). Every new generator routes through here. |
| `llm.ts` | Older `callChat()` path. Still used for chat surface and for the paid Claude opt-in in productions. |
| `librarian.ts` | **The Subjects engine.** Two passes (themes + tensions/evolutions/open-loops). Verbatim-spans-fed prompt. Writes into `clusters` with `subject_source='librarian'`. Auto-rebuilds `operator-profile` + `spark-seeds` on completion. |
| `voice-shape.ts` | Pulls 6 strength-varied, register-diverse takes WITH verbatim spans. Formatted as a system-prompt block. Injected into every generator that produces voice-shaped output. |
| `operator-profile.ts` | The "knows me" digest. `loadOperatorProfile()` for cheap reads (one row + top 14 subjects); `rebuildOperatorProfile()` runs gpt-oss-120b medium-effort synthesis. Cached on `operator.profile_digest`. |
| `spark-seeds.ts` | 5–8 short-form concept hooks for the Spark composer. Cached on `operator.spark_seeds_json`. Same auto-refresh trigger as the profile. |
| `research.ts` | Topics' research path. `researchTopic()` uses Cloudflare Browser Run `/crawl` for pasted/auto-found URLs; brief synthesis via gpt-oss. `suggestTopicAngles()` proposes the angle cards on the topic detail page. |
| `broll.ts` | The b-roll pipeline. `writeImagePrompt()` (Kubrick-tier — no faces/logos/clichés, 3-plane layered composition); `generateBeatImage()` (Flux); `animateBeatImage()` (Wan with Ken Burns fallback); `generateBeatVideoDirect()` (Grok Imagine with synced audio). Aspect parameter threads 9:16 through for shorts. |
| `tts.ts` | Voice synthesis. `synthesizeBeat()` with `{ text, model, fellBack }` envelope: tries MiniMax clone, falls back to Aura-2 preset. `PRESET_VOICES` is the picker list. |
| `extract-unified.ts` | The single extraction orchestrator (threads + creative + clips + entities). Replaces the older `extract.ts` (deprecated; do not extend). |
| `validator.ts` | 4-gram verbatim grounding checker. Used by extraction to flag ungrounded takes (`validated=0`) AND by the video_essay generator to score script grounding ratio (retries once if <50%). |
| `transcribe.ts` / `whisper.ts` | Whisper transcription wrappers. |
| `r2.ts` | R2 ops; `R2Env` interface includes presigned-URL helpers. |
| `d1.ts` | D1 query helpers (`getDb`, `findOne`, `findMany`, `run`, `batch`). |
| `access.ts` | Cloudflare Access JWT parsing → `requireOperator()`. |
| `dispatch-pipeline.ts` | Triggers the DO-based post-upload pipeline. |
| `recorded-at.ts` | Four-tier date fallback for `vlogs.recorded_at` (pre-extracted → mvhd → filename → upload time). |

## Cloudflare Workflows / Workers

- **`workers/process-upload`** — post-upload pipeline (transcode → thumb → audio → transcribe → fan-out extraction). Each step `softStep()`-wrapped for resilience; failures recorded in `vlogs.extraction_outcomes`.
- **`workers/pipeline`** — Durable Object that broadcasts pipeline events over WebSocket to the live vlog detail UI.
- **`workers/ffmpeg`** — Container Worker. Endpoints: `/transcode-h264`, `/extract-thumb`, `/extract-audio`, `/extract-audio-segment`, `/extract-video-segment`, `/concat-audio`, `/render-video-essay` (accepts `aspect: '16:9' | '9:16'`), `/ken-burns` (image → motion clip).
- **`workers/healer`** — cron worker (disabled by default; manually invocable) that detects stuck rows and re-dispatches.

> The "Inngest" name is a relic — Inngest was removed long ago. Everything async is Cloudflare Workflows + the DO pipeline.

---

## Rules for Claude

**Doc upkeep:**
- **Update this document when a feature is built or a decision is made.** Same commit. The audit done on 2026-06-12 found dramatic doc drift; don't repeat it.

**Vendor & infrastructure:**
- **All Cloudflare + optional Anthropic.** Refuse to reintroduce Supabase / Inngest / Replicate / ElevenLabs / fal.ai / OpenAI / AssemblyAI / Bing — say so explicitly if asked.
- Brave Search API is the only sanctioned third-party touchpoint (Topics auto-search). It's optional; without it, Topics falls back to pasted URLs.
- `export const runtime = 'edge'` on every Next.js route + page.
- Never hardcode API keys; they're Worker secrets.
- Large files go direct to R2 via presigned URLs — never through API routes.

**Models:**
- Hard reasoning (librarian, scripts, angle suggestions): `callReasoning()` in `src/lib/models.ts`. Defaults to **gpt-oss-120b** at `high` effort with Llama 70B auto-fallback. Don't direct-`env.AI.run()` these tasks; the abstraction reports model + fellBack which we surface in UI.
- Extraction free tier: Llama 3.3 70B. Premium/max: Sonnet.
- Image gen: Flux 1 Schnell. Image-to-video: Wan 2.7 with Ken Burns fallback. Text-to-video with audio: Grok Imagine.
- TTS: MiniMax 2.8 Turbo for cloning, Aura-2 for presets. Both via `synthesizeBeat()` in `tts.ts`.

**The "knows me" layer (do not skip):**
- Any new prompt that generates material for the operator MUST inject `formatOperatorProfile(await loadOperatorProfile(...))` and/or `formatVoiceSamples(await loadVoiceSamples(...))`. The operator's mind + voice are the point.

**Voice preservation:**
- Don't sanitize voice in extraction outputs. Hesitations, profanity, fragments stay. The 4-gram verbatim check (`src/lib/validator.ts`) enforces this and runs on extraction *and* generated video-essay scripts.
- Per-vlog override toggles: don't add until operator asks.

**Product invariants:**
- Don't auto-publish anything. The `published` state is operator-gated.
- Don't build the tier picker UI until operator asks.
- Don't bulk re-extract old vlogs. Re-extraction is opt-in per vlog.
- Don't propose pg_dump / RLS / Supabase patterns — they don't exist here.
- Don't extend stub tables (`macro_clusters`, `motifs`, `characters`) without operator decision.
- Don't reintroduce `extract.ts`; `extract-unified.ts` is the active orchestrator.
- **NO CAPTIONS, NO TEXT OVERLAYS** — ever (see the rule section earlier in this doc).

**On the audit & doc reality** (2026-06-12):
- The 7-entry nav from earlier doc versions is dead. The current nav is **Subjects · Topics · Vlogs · Published**. Studio / Inbox / Chat / About / Timeline still ROUTE but are not destinations.
- If the operator asks about reviving any of those, they're routable today (no work needed); discoverability is the only thing missing.

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
