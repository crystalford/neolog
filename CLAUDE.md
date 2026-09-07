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

## ⚠️ The log — what this product is now (7 Sep 2026)

**neolog is a permanent personal record.** You put things in — typed, spoken,
photos, files — and the log keeps them, in order, dated twice, with the way
back to every word. The video-essay engine is one thing built on top of that
record; it is not the record.

This was built from a 130-file design package (`SPEC.md`, `HANDOFF.md`, 57
pages) produced between 15 Aug and 7 Sep 2026. **The pages are the spec.**
Where a page and `SPEC.md` §0 disagree, §0 wins; where a page and prose
disagree, the page wins.

**The seven first principles** (`SPEC.md` §0 — these outrank everything in
this file):

1. The log is a place to put things and get them back.
2. The log is quiet. It never comments on an entry. Roughly one question a
   month, asked straight — never *"you've mentioned this eleven times."*
3. Only what was said. Nothing is inferred or filled in. Guesses are marked
   as guesses; a caption the operator didn't write is marked as the log's.
4. Every line stands alone, and is a sentence. Subject, verb, object. No
   *"isn't X — it's Y"* pivots, no fake-humble diminutives, no hedged verbs.
5. Necessity before schema. Seven kinds, and nothing else until a real entry
   needs one.
6. **Never ask a question at the moment of input.** One line saying what
   happened, one undo, then silence.
7. You never write something down because it would look good in public.

**Two times on every entry.** `happened_at` (when it occurred) and
`logged_at` (when it entered the log), both always stored, default sort
`happened_at`. Every file is placed by its own clock — EXIF, media metadata,
filename — and one with no usable clock is placed by inference and **marked
`approximate`**. The operator is never asked to date a file.

**Public by default; the log holds back the exceptions** (`SPEC.md` §0.2).
What the operator writes is public and unmarked. What he *uploads* is
different: an image lands `held` and is released only after the vision check
has looked at it. The log **says what it saw** — "a name, a date of birth and
a number laid out like a card" — never an unnamed reason. Being wrong towards
private is the only safe direction, so every failure path holds back.

**Burial, not deletion.** There is no delete action. Bury removes an entry
from the feed, search and counts and keeps the file, the attachments and the
relationships. The one exception is the receipt's **undo**, which is for
something that should never have gone in at all.

**Two gestures on a row, and only two** (`SPEC.md` §11). Click the image → a
lightbox over the feed. Click anywhere else → the entry's own page. There is
no third expand-in-place gesture. A row links to its content, never to the
container it belongs to, and **a row whose entry has no page of its own is
not clickable** — never invent a destination to satisfy an affordance.

**Settled here, and recorded because `HANDOFF.md` left it to Claude Code:**
*does the log read the old `vlogs` table directly, or do those rows become
`log_entries`?* — **It reads them where they live. There is no import.** The
argument is in `src/lib/log-entry.ts`: `vlogs` carries twenty columns no entry
row could hold, and `recorded_at`/`created_at` already *are* the two times.
This does not violate §0.1 ("never author a second feed") — §0.1 forbids two
*authored* feeds that can disagree, and requires one feed, one entry shape,
one shell. `/api/v2/log` is that one feed over three tables.

### Relog — the corpus is already the log

A vlog showed on the feed as one line: "Recorded 22 minutes of video." What
he actually said is in `threads` — one row per take with verbatim
`key_quotes` and a `transcript_span_start`. **Relog** (`src/lib/relog.ts`,
`POST /api/v2/log/relog`, paged + idempotent via `source_ref='thread:<id>'`)
turns each into a dated entry placed at `recorded_at + span_start`.

**Three tiers, and the first one that yields a line wins.** Nothing here
calls a model.

1. **A `key_quote` verified verbatim** against the recording's own
   `transcript_text`, with the 4-gram check in `src/lib/validator.ts`, at
   relog time. His line: `author='operator'`, `grounded=1`.
2. **The span itself.** When no quote survives, the log does not reach for
   the model's prose — it reads the stretch back out of `transcript_words`
   between `transcript_span_start` and `_end` (seconds). Also his. A failed
   quote check means the model paraphrased; it does not mean he said nothing.
   The slice is checked with **`isFullyGrounded`** — EVERY 4-gram must appear
   in `transcript_text`, not merely one. `isGrounded` asks "did this touch
   the recording at all", the right question for a paraphrase and the wrong
   one for a passage about to be attributed word-for-word. One query per
   recording, not per thread; spans clamped to 90s, words to 200; the line is
   as many whole sentences as fit under sixty words and what trails it is the
   detail.
3. **The `take`**, only when there is no span or no word-level transcript —
   and then it is the log's line, `author='log'`, which the feed labels
   "arrived".

**Never relax any of this** — it is the only thing standing between the log
and putting words in his mouth. `scripts/test/relog-line.mjs`, 19 assertions
in CI, is written around the refusals.

### Pages seed from what the passes already named

`entities` + librarian `clusters` → `pages`, idempotent via `source_ref`;
`entity_mentions` → `page_entries` (a mention names a thread, relog put that
thread on the log carrying the same ref, so they join without a new column).

### Recall — the one place the log asks

`src/lib/recall.ts`. Three kinds only, all facts with one right answer:
an entry the log had to date by inference, a year with nothing between two
years that have something, and a page the log named itself. **No model
writes a question.** Max three open at once. "Don't remember" is a complete
answer and closes the question for good. The four things it must never ask —
what a recording MEANS, WHY he did it, whether it was GOOD, who someone IS
to him — are structurally impossible to generate here.

### Correspondence — the one kind with someone else in it

`messages.html`. `src/lib/correspondence.ts`, `/messages`, `/messages/[id]`.
A conversation is the only thing on the log that is half somebody else's, so
it works differently from every other kind.

**Forwarded, never pulled.** There is no ingest connector and there will not
be one — the absence IS the enforcement. `POST /api/v2/log/correspondence`
requires a paste.

**Two owners.** His messages become `log_entries` under the normal rules.
Theirs are written to `correspondence_messages` and stop there. An entry
carries `author='operator'`; putting another person's sentence behind that
flag is the same lie relog was already fixed for.

**Which side is his is never guessed.** A thread labelled by name on both
sides comes back `409 { needs: 'mine', speakers }` with **nothing written**.
Guessing wrong files their sentences as his.

**Their yes is a fact, not a checkbox.** Four states on `pages.consent`
(`kept_private` — the default, applied without asking · `named_not_quoted` ·
`quotable` · `not_on_the_log`), with `consent_at` and `consent_note`. It
lives on the PERSON'S page, so one answer governs every thread they are in.
`asConsent()` resolves every unknown, null or near-miss value to
`kept_private` — never to the last state seen.

`publicView()` is the only place the states turn into what a stranger sees,
and every surface calls it. At the default it returns his words and **their
absences as rows** — removing their turns would produce a monologue that
reads as though he said all of it. `not_on_the_log` publishes nothing at all,
for the same reason. `/messages/[id]` renders that preview from the same
function, so he sees what publishing would do to someone else before he does
it. `scripts/test/correspondence.mjs` — 31 assertions, in CI.

### Screenshots — three piles, and only one is offered

`screenshots.html`. `src/lib/screenshots.ts`, `/screenshots`. The vision pass
already reads the words out of a picture; the sort is a question about that
TEXT, not about him — does it carry a currency amount beside a receipt word,
a named speaker with a real sentence behind the colon, a route and an
arrival time. Those are facts anyone can check, so the sort is **regexes, not
a model**: a model asked "is this worth keeping?" answers with an opinion
about his life, which §0 rules 2 and 3 both forbid.

**Junk is offered, never decided.** Nothing in the library buries anything;
it returns a pile and the reason, in words checkable against the picture.
Every row in the bury pile has a *keep this one*, and burying is reversible.
The fallback pile is always `keep` — unrecognised text is never offered for
burying.

Someone else's words are checked **first**, before receipts and before
convenience, so a screenshot of a message can never be offered for bulk
burial on a heuristic; it gets the message rule instead.

Intake now takes the entry's kind from what the text says. It used to file
every readable picture as `paperwork`, which made a screenshot of a map into
a receipt: now a receipt is `paperwork`, someone's message is `read`, and
anything unrecognised is `seen`. `scripts/test/screenshots.mjs` — 21
assertions, in CI.

### Documents — every made thing, one shape

`writing.html`. `src/lib/documents.ts`, `/writing`, `/writing/[id]`, tables
`documents` + `document_drafts`. Eight kinds (essay · report · code ·
produced video · voice-over · deck · design · export) that differ only in two
fields and in what the body points at, so they are one table, not eight.

**Whole. Never split.** This is what separates a document from a paste.
`split-note.ts` splits a recollection INTO entries because that is what a
recollection is for. A finished piece was made to be read whole, and cutting
it into lines destroys it — so nothing here calls the splitter, and a
document shows on the feed as ONE entry saying it was made.

**Who made it is a field, always filled in.** `operator` · `operator_with_log`
· `log_drafted_kept` · `log`. `asMadeBy()` resolves an unknown value to
**`log`**, not to him — claiming he wrote something is the wrong direction to
be wrong in. The entry's `author` comes from `made_by`, not from who pressed
the button, so the log never signs his essay and he never signs the log's
report.

**Every draft kept.** A new draft writes a `document_drafts` row before
`documents.body` changes — the same rule `entry_revisions` enforces for a
line. Any draft can be shown again; none is replaced.

**Above the fence.** Publishing runs the text through nothing: no reading, no
reduction, no redraft. It sets a flag and a date, `made_by` travels into the
file, and the entry's visibility follows the document's so the log can never
show a made thing as public while the thing is not. Taking it down is one
button and reverses both. A letter the log drafts in his voice is a different
thing and stays below the fence (`letters.html`).

### Footage — the record as material

`footage.html` / SPEC §2. `/footage`, `/api/v2/footage`, `+ /sheet`. The same
recordings the log quotes from, seen as a bin. It closes the "organization
app" gap.

**The second index.** A recording is already findable by what he SAID. This
is the other half — what was in front of the camera, from the `vision_*`
descriptions `src/lib/vision.ts` already writes off the thumbnail. Nothing
new is generated. The row says **which index matched**: "found in the frame"
and "found in what you said" are different facts, and someone looking for a
shot needs to know which one they got.

**His marks, not a score.** `vlogs.usable` is null / 1 / 0 — and null means
*he has not said*, which is not "no". Pressing the same mark again clears it
back to null.

**Corrections keep both.** His `frame_note` goes in its own column and the
log's `vision_description` stays; the page shows both, marked, rather than
one replacing the other.

**The hand-off.** `/api/v2/footage/sheet` is CSV — one row per clip with what
it is, how long, when, both frame descriptions, his mark and a seven-day
link. The header says the links expire rather than handing over URLs that
quietly stop working. The originals are not copied.

**The fence, drawn on the page.** Results are in date order, always. No
relevance ranking, no suggested shot list, no "clips that would work for
this" — a relevance score is the log having an opinion about which of his
footage is good, and that is exactly what the fence exists to prevent.

### Corrections leave a record

`entry_revisions` keeps what every correction replaced. Nothing overwrites
without the old value being kept first — "both versions kept, dated, marked
revised by you." The PATCH handler reads the row before it writes.

### The mechanics built on top of the entry

**Threads** — one column, `led_from`. No thread table, no thread id, no
membership: a thread is that column followed either way. `relation`
distinguishes a **turn** (a new event) from a **reflection** (SPEC §1: "a
later thought about an earlier event attaches to that entry… **it never
becomes a second event**"), and a reflection renders as a layer under its
target rather than taking a row.

⚠️ **The column's two values are `led_from` and `reflects`**, exported from
`src/lib/log-entry.ts` as `RELATION_DEFAULT` and `REFLECTS`. Import them;
never type the string. A wrong value here is invisible to every check the
repo has — the column exists, the type is TEXT, `tsc` and
`check-sql-columns.mjs` are both green — and the only symptom is a reflection
quietly rendering as an event. The walk shipped with an invented
`'turn'`/`'reflection'` pair and was caught by reading the intake, not by a
failure.

Deliberately NOT at `/thread/[id]` — that route serves the extraction
`threads` table, a different thing with the same word, linked from five
places. This repo already paid once for a naming collision.

**The route view is `/walk/[id]`** (`walk.html`), reached from the turns block
on any entry. The id in the path is an ENTRY's — there is no thread row, so
every turn on a route opens the same walk. One query does both directions: a
recursive CTE up to the start, then `UNION` (not `UNION ALL`) down over
everything that led from it, so a `led_from` cycle terminates instead of
running to the depth cap. It keeps the three things a list cannot: **loops**
(a turn whose `led_from` is not the turn before it in time — followed as a
real edge, never inferred from order), **returns** (a turn that came from
reading the log hours later is still on the route; no session window), and
**wrong turns** (nothing is pruned). The design's "offer" at the bottom of
that page — *here's the turn you haven't taken* — is below the fence and
stays there.

The CSS row class is `.leg`, not `.turn`: `.logpage .turn` is already the
entry page's came-out-of/led-to card and sets a border, padding and
first/last radii that would box every step. A different thing gets a
different class rather than a specificity fight.

**Corrections** — `entry_revisions` keeps what every change replaced. Nothing
overwrites without the old value being kept first.

**Verification** (`src/lib/keep.ts`) — the client hashes a file before it
leaves the browser; the log hashes what it stored and compares. Byte-for-byte
to 50 MB, length above it, and the UI **names which check ran**. Claiming the
stronger check would put a lie inside the one feature that exists to be
trusted. Exact duplicates attach to the first arrival rather than becoming a
second entry.

**Record of origin** — `/api/v2/export?entry_id=…` exports the road to one
position: the turns either side, the reflections, and every correction with
both wordings. That last part is what a finished piece structurally cannot
show.

### ⚠️ `readyDb()` — any route reading a freshly-added column must await it

`getDb()` starts migrations **fire-and-forget and does not await them**
(`src/lib/d1.ts` explains the trade). That is fine for a route touching
columns that have existed for months, and broken for one whose columns landed
in the same deploy: the first request queries a column that does not exist
yet. Same failure as `vlogs.transcript`, but transient — it looks like the log
is broken, then mysteriously isn't.

**Every route reading this session's columns wraps its db in
`readyDb(getDb(env), 'label')`** (`src/lib/ready-db.ts`). Sixteen of them do.
Add the wrapper to any new route that reads a column added in the same
deploy.

### Watch the hot path at scale

Three things were fine at four entries and wrong at four hundred, found by
looking rather than by failing:

- the **fold** ran one D1 query per bucket — ~50 per home-page load. One
  query now, assigned in memory.
- **seeding pages** had no `LIMIT` on a join over `entity_mentions`. Capped at
  4,000 per press; it is idempotent, and the index says "press again".
- the **feed** presigned every row from all three tables *before* merging and
  trimming — up to 600 HMAC signings to show 200 rows. Only survivors are
  signed.

### ⚠️ `scripts/check-sql-columns.mjs` and `check-routes.mjs` — keep both green

A wrong column name is a runtime error, so `tsc` and `next build` are both
blind to it. On 7 Sep the feed selected `vlogs.transcript` (the column is
`transcript_text`); everything was green and `/api/v2/log` returned 500 for
every request — **the log did not load at all**. The checker reads
`db/schema.sql` + every migration and validates alias-qualified references in
`src/`. It runs in CI before `tsc`. It immediately found three more live bugs
(`operator.name` in both public production routes, `vlogs.is_audio_only`).

`check-routes.mjs` covers the same blind spot from the other side: a fetch to
a renamed or never-built path is a runtime 404 that renders as an empty list —
which reads as "nothing here yet" rather than as a bug. 131 routes, 150
fetched paths.

**Package inventory, 7 Sep 2026** — 74 distinct pages (excluding the 37
`e-*` entry examples): **43 built · 6 partial · 16 not built · 4 below the
fence · 5 meta**.

Partial: `fix` (per-word transcript editing), `branch` (splitting one note
into several), `audio` (no two-voice split — `transcript_words.speaker` exists
but nothing populates it; Whisper is not asked for diarization, so the split
cannot be built honestly yet), `flow` (a walkthrough page). `walk` and
`screenshots` are built.

Not built: `elsewhere` · `photo` · `recording` (public); `image` ·
`image-filter` (per-kind bodies — `/entry/[id]` already renders an image
entry whole; these are the per-kind refinements). `messages` and `writing` shipped — see
**Correspondence**, **Documents** and **Footage** above. `repo` is a `code`
document whose body is the README; the commits-folded-by-week view is not
built. **The
machine layer shipped** — `dossier` → `/facts`, `everything`, `source` →
`/glossary`, `asks`, `numbers`, plus the four feeds.

Two halves of that layer were deliberately left out, and both are the same
refusal. `asks.html` writes prose answers with sub-questions fanned beneath
them; `numbers.html` writes a reading under each figure. A model writing an
answer in his voice on a surface that presents itself as a record is what §0
rule 3 forbids, and a sentence about what a count MEANS is the log commenting
(§0 rule 2). So the question and the answer are both his, joined by
`led_from` and nothing else; and the slot under a number holds the rule it
was counted by instead. `/search` remains the one place a written answer
lives, and it checks its citations first.

Below the fence and **staying there**: `letters`, `thinkit`, `sayit`, `cut`.

**Later additions this session:** a pasted **conversation** is kept whole and
split, and only HIS turns become entries (`src/lib/conversation.ts`) — the
consent rule from `audio.html`. A pasted **document** is "kept", not written:
the log cannot know who wrote it and must not ask at input, so the line is the
log's and he claims it in one tap. The vision pass **reads the words out of a
picture of a note**. An undated picture asks when it was taken. An idea's page
carries **first said** and how it has changed.

**The build order is void.** The operator lifted it on 7 Sep: *"not
necessarily follow the steps because they may not be relevant since we
already built a version of the system... go through the whole thing and build
the full system."* Steps 2–5 are in scope. What remains unbuilt: **the fold rules past twenty**
(`log-2028.html`), the per-kind bodies, and everything below the drafting fence — letters, cuts,
the offer, anything that drafts in his voice. That last group stays below the
fence regardless.

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

The masthead is a **top-horizontal nav, four primary entries.** This is the result of a site-consolidation pass: the earlier two-entry "Log · Published" nav (from the front-door rebuild) left Subjects, Topics, and the archive genuinely orphaned — no nav entry, no dropdown entry, reachable only via a home-page card that might not surface, or by typing the URL from memory. That's fixed now — every real content surface has a real door.

| Label | Route | What it is |
|---|---|---|
| **Log** | `/` | **Home — the log.** The composer on top (type, talk, drop files in; auto-grows from one line to a chapter; a `when` control for backdating with a precision — *that day / that month / that year* — so "2008 was a huge year" doesn't have to pretend to a day). Then the receipt: one line, one undo. Then search, the eight-way filter toolbar, the order toggle (*when it happened* / *when I logged it*), and the day-grouped feed. The rail carries the written-down bar (coverage by year — the door to thin years) and what arrived on its own. |
| **Archive** | `/photos` | Photos + videos + vlogs, one dated timeline. Owned, permanent — the "replace Google Photos" surface. HEIC converts in-browser, EXIF/recording dates drive ordering, every item gets an automatic AI description whether or not there's narration. Also hosts the progress-video builder (time-lapse / before-after from a detected photo series). |
| **Drafts** | `/drafts` | Subjects + Topics + Clips as three tabs on one page (`?tab=subjects\|topics\|clips`, default subjects). The engine's three "what should I make next" surfaces, consolidated. Subjects = librarian-named concepts from your own recordings. Topics = type-a-subject research + script engine. Clips = clip-quality-judge-scored lines across every vlog, with a self-driving backlog scorer. |
| **Published** | `/published` | The accumulating body of work — only productions in `state='published'`. Honest signal if empty. |
| **Now** | `/now` | The intake with nothing else on the screen — the signal-wave field, the slab, one hint after a few seconds in an empty field. No nav, no feed, no counts. Reached from *full screen* in the composer. |
| **An entry** | `/entry/[id]` | One entry, whole: both dates and the distance between them, who wrote each line, the file at full size, the transcript. The rail is the corrections — wrong date (a year alone is a complete answer), wrong words, who can see it, bury/dig up. **The fix lives where the mistake is.** |
| **Ready to send** | `/ready` | What used to be home — the CapturePanel and the system-drafted production candidates, moved whole. The machine's suggestions drawn from the record; the record is what home is for. |
| **Index** | `/pages` | Every name, place, project and subject on the log — each one a page. Banded into going-on-now / from-before / people / places; columns page · kind · span · entries · status. Status and span are derived on read so they cannot go stale against the counts. Seeded from `entities` + librarian `clusters`. |
| **A page** | `/page/[id]` | One page: compact header, the log's one paragraph (marked as the log's; becomes yours when you edit it), then the log filtered — **the same rows and day dividers as the feed**, via `src/components/LogRow.tsx`. Rail = corrections: rename, wrong kind, write/edit the paragraph, "not a page, just a thought". |
| **Export** | `/export` | Pick a range, a page, or both. Markdown + a JSON manifest. Every line carries its provenance; nothing is added that isn't in the log. |
| **The public log** | `/public` | The same feed filtered to `visibility='public'`, rendered plainer. **A preview — it still needs signing in**, and it says so. Making it genuinely public is one Access bypass app, and that act is the operator's. |
| **The facts** | `/facts` | `dossier.html`. What the log can state about him — work, projects, people, places — each with the dates it already derived, newest first, **no ranking**. His one sentence or none: the log will not draft a sentence about a person. Person schema. |
| **Everything** | `/everything` | The one door to the machine layer, **linked from the log's footer and never from the nav** (§3: "a stranger chooses between two things"). Every address with its real count beside it. |
| **The glossary** | `/glossary` | `source.html`. Every term and subject with a page, and the sentence it was first said in. DefinedTermSet. |
| **Questions** | `/asks` | `asks.html`, minus the drafting. A question is an entry ending in `?`; an answer is an entry that `led_from` it. Both his. Open ones kept visible in their own section. FAQPage. |
| **Numbers** | `/numbers` | `numbers.html`. Counts over dated rows, each carrying **the rule it was counted by**. No reading of what a number means — that would be the log commenting. Dataset. |
| **Search** | `/search` | Ask the log a question. The answer is written only from passages it can point at — **every sentence's citations are checked in code against the passages actually sent**, and uncitable sentences are dropped (and counted, out loud). The abstain line — "Not answered: …" — is the only line allowed no citation. Retrieval is keyword over entries + transcripts, and the page says so. |
| **A month** | `/month/[ym]` | Reduction as a place. The month in one paragraph, written from that month's entries only, every sentence citing one. Coverage per day. Once he edits the paragraph it is his and the log stops rewriting it — refused at the SQL level, not just hidden. |
| **On this day** | `/onthisday` | The one permitted resurfacing. Shows; never says. No "one year ago", no count, no nudge. Approximate dates are excluded — a guessed day has no business on the surface whose discipline is not saying. |
| **Safe to clear** | `/clear` | The loop the log exists to close. Four states per file; only `checked` means delete it locally. SHA-256 byte check up to 50 MB, length check above it — **and the row says which one ran**. |
| **Going through what arrived** | `/triage` | One card, four keys, no wrong answers. Not an inbox: nothing is blocked on it, there is no badge, and skipping the pile costs nothing. |

**The feeds** — `/feed.xml` (RSS 2.0), `/feed.json` (JSON Feed 1.1, where
`date_published` is *happened* and `date_modified` is *logged* — the two
times map without loss, and a `_neolog` extension carries the precision and
who wrote the line), `/llms.txt` (what the site is, with live counts; it says
where the primary material is and never describes the operator), and
`/sitemap.xml` (public addresses only). All four resolve the sole operator
row without auth, the way `/podcast.xml` does, and select **only**
`visibility='public'` — the gate is in `loadPublicFeed`, once, so a new feed
cannot forget it. They still sit behind Access until the operator adds a
bypass app.

**The fold** (`log-2028.html`) is on `/` itself: the last 14 days open as rows, then one line per week, per month, per year. A folded line carries **a real sentence from that period**, never a synthesis — writing period summaries needs the citation machinery, not a prompt.

**Detail pages** (reached from nav-page cards or deep-linked):
- `/vlogs` — raw archive of recordings, reachable from the avatar dropdown ("Upload a vlog").
- `/vlog/[id]` — one vlog. Includes the **in-podcast toggle** and the **auto-publish toggle**.
- `/subjects/[id]` — one subject's evidence + deliverables. `/subjects/[id]/skeleton` — **plan-the-structure script flow**; operator approves the beat structure before any prose is written.
- `/topics/[id]` — research brief → build-script flow for one topic.
- `/clips/[id]/edit` — text-based clip trim/extend editor (Descript-style: click a word to set start, shift-click to set end).
- `/production/[id]` — a generated script/video, the real engine output. Edit script, record voiceover per beat (or **synthesize via your cloned voice**), generate AI b-roll per beat (Flux + Wan, optional Grok Imagine direct-video with audio), render to MP4.
- `/projects/[id]` — Pack-Rats-style project containers (a distinct, older data model — the `projects` table — unrelated to `/production/[id]`'s `productions` table; renamed from `/productions/[id]` specifically to end that naming collision).
- `/p/[id]` — public production view (no auth).

**Settings** (`/settings`) — operator card + sections: Identity · AI models (Llama 3.3 70B is the current default — *not* Kimi, despite earlier docs) · **Your voice** (record 10 seconds → MiniMax 2.8 clones it for synth; or pick an Aura-2 preset) · API keys (incl. optional **Brave Search key** for Topics auto-search) · Integrations · Storage · Pipeline · Auto-publishing (fanout webhook URL, default-on toggle).

**Secondary surfaces — still functional, avatar dropdown only:**

| Surface | Route | Status |
|---|---|---|
| **Studio** (clusters/cultivation) | `/studio` + `/studio/[id]` | Fully functional. Ripeness gauge, thread-progression timeline, refine panel, insight CRUD. |
| **Inbox** (triage) | `/inbox` | Fully functional. Failed vlogs, in-progress clusters, unfinished projects, surfaced cards. |
| **Chat** | `/chat` | In-app assistant with tool calls into your corpus (search vlogs, fetch threads/clusters, draft posts). |
| **About** | `/about` | System explanation. |
| **Podcast feed** | `/podcast.xml` | RSS 2.0 + iTunes namespace feed. Per-vlog `is_podcast` toggle on `/vlog/[id]` controls inclusion. Public bypass on Cloudflare Access. |
| **Entity hubs** | `/entity/[id]` + `/graph` | Routes resolve so entity-chip deep links work. No primary nav entry; intentional. |
| **System / health** | `/system` | Debug/health surface. One hop from Settings. |

**Removed this pass** (confirmed dead — see the site-consolidation plan for the safety verification):
- `/console` — was a byte-identical duplicate of `/chat` at a second URL, zero inbound links.
- `/materialize/[id]` — was a non-functional UI stub; its submit button only called `alert()`, no API call.

**Old paths that redirect:**
`/clusters` → `/studio` · `/cluster/[id]` → `/studio/[id]` · `/timeline` → `/` · `/timeline/[id]` → `/vlog/[id]` · `/subjects` → `/drafts?tab=subjects` · `/topics` → `/drafts?tab=topics` · `/clips` → `/drafts?tab=clips` · `/capture` → `/vlogs?capture=open` · `/uploads` → `/vlogs` · `/library` → `/projects` · `/transcript` → `/?filter=thread` · `/states` → `/` · `/post` → `/projects` · `/clip/[id]` → `/thread/[id]` · `/article/[id]` → `/projects` · `/attachment/[id]` → `/` · `/broll/[id]` → `/vlog/[id]` · `/landing` → `/` · `/[handle]` → `/`.

---

## Design vocabulary — applied uniformly

Pure black bg (`#000`), cool-gray fgs, **steel signal `#4ea1d5`** — one signal colour (`SPEC.md` §1). Replaced cobalt `#5b8df6` on 7 Sep 2026: cobalt competed with the blue territory hue, steel doesn't. `--fg-3`/`--fg-4` were lightened to `#9a9aa4`/`#8a8a94` at the same time — the old zinc ramp failed contrast at the 10.5px floor. Ten topic territories (brass / terra / ochre / rose / plum / violet / steel / teal / sage / moss). Geist (200-700) + JetBrains Mono (300-500). **Mono is for dates and IDs only — never on a button.**

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

**Default LLM model: Llama 3.3 70B** for extraction; **gpt-oss-120b** (Workers AI) for hard reasoning (librarian, angle suggestions, scripts). Claude Sonnet 5 is the paid opt-in. The model registry lives at `src/lib/models.ts`.

---



## The three extraction passes

Every ingested vlog runs three parallel passes after transcription, plus entity extraction. The **tier** (set per vlog from the vlog detail page, default `free`) picks the LLM provider for each pass:

| Pass | Output table | `free` (default) | `premium` | `max` | Purpose |
|---|---|---|---|---|---|
| Analytical | `threads` | Llama 3.3 70B | **Sonnet 5** | Sonnet 5 | topic / take / key_quotes / register / strength / abstracted_topic |
| Creative-mode | `creative_elements` | Llama 3.3 70B | **Sonnet 5** | Sonnet 5 | Fictional / creative material for projects |
| Clip-candidate | `clip_candidates` | Llama 3.3 70B | Llama 3.3 70B | **Sonnet 5** | Delivery moments where the operator nailed a segment |
| Entity | `entities` / `entity_mentions` | Llama 3.3 70B | Llama 3.3 70B | **Sonnet 5** | People, places, projects, tools, concepts, themes |

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
| Extraction LLM | Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for `free` tier; Claude Sonnet 5 for `premium` / `max`. |
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

Cinematic warm dark. Bone-on-ink. Geist body, JetBrains Mono for dates and IDs only — never on a control.

**Tokens live in `src/lib/design.ts`.** Import from there; do not redefine inline.

**Three rules from the design package's `plain.css`, now binding:** nothing on screen below **10.5px**; **no uppercase-letterspaced labels** — a label is a word, not a code; **no accent stripe on any card edge**. One frame everywhere: `max-width 1140px`, `padding 0 44px` → 1052 inner, spent as 708 + 48 gap + 296 rail. Nothing reframes when you click.

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
- The 7-entry nav from earlier doc versions is dead. The current nav is two entries — **Log · Published** — with everything else (Subjects, Topics, the quick-video composer, Studio, Inbox, Chat, About, Timeline) still routable but no longer marketed as destinations. Subjects + Topics surface as cards on the home page when the system has prepared something worth reviewing.
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
