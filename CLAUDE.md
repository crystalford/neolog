# Neolog

**A permanent personal record.** You put things in — typed, spoken, photos,
files — and the log keeps them, in order, dated twice, with the way back to
every word.

Three things it does that nothing else does:

- **It never puts words in your mouth.** Every line says who wrote it. A line
  the log composed from a file's metadata is marked as the log's, always,
  including the ones that read naturally.
- **It reads your recordings without a model.** Four hundred vlogs become
  entries by cutting the transcript at your own pauses — your sentences, at
  the second you said them. Nothing summarises, nothing paraphrases.
- **It closes the loop on your phone.** A file is checked byte-for-byte
  against what arrived before anything tells you it is safe to delete
  locally.

Everything runs on Cloudflare: Pages, R2, D1, Workers, Workers AI (Whisper),
Access, and FFmpeg in a Container Worker. One bill.

> **⚠️ There was a different product here.** Until 8 Sep 2026 this repo was an
> AI video-essay studio — Subjects, Topics, Spark, a librarian, a production
> engine, voice cloning, b-roll. **All of it is deleted**, along with every
> table it wrote into, at the operator's instruction: *"i don't want to see
> evidence of the old site... the problem with the old system was i didn't
> trust its output anyway."* The recordings in R2 are the only thing that
> survived. If you find a reference to any of it anywhere in this repo, it is
> a leftover and it should go — do not rebuild against it, and do not
> reintroduce a generator, a model-written summary, or a "what should I make
> next" surface.


## ⚠️ Operator environment — do not assume an IDE

The operator uses the **Claude Code desktop app on Windows**, not VS Code, not a terminal, not an IDE. This means:

- **The Claude Code session IS the operator's runtime.** When you run a bash command, you're running it on their machine. Treat this session as the deployment environment.
- **Never tell the operator to "open a terminal," "run a command locally," "pull the branch on your machine," or "edit a file in your editor."** They don't have any of those tools. You do all of that for them from this session.
- The operator can paste values in chat, click in browser dashboards, and toggle settings inside the Claude Code app. That's it. Anything else, you handle.
- Network access to external APIs (Cloudflare etc.) is controlled in Claude app: **Settings → Capabilities → "Allow network egress" + "Domain allowlist."** Required domains for this project: `*.cloudflare.com`, `*.cloudflareaccess.com`, `*.workers.dev`, `*.r2.cloudflarestorage.com`.
- The Cloudflare-side bootstrap (D1, Workers, Access, Containers, deploy) all runs from THIS session via `wrangler`, not from "the operator's machine." There is no separate machine.

---

## ⚠️ The log — what this product is (8 Sep 2026)

**neolog is a permanent personal record.** You put things in — typed, spoken,
photos, files — and the log keeps them, in order, dated twice, with the way
back to every word.

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

### Reading a recording — the corpus is already the log

Four hundred recordings sit in R2. Until they are read, each shows on the
feed as one line: "Recorded 22 minutes of video." True, and nearly useless.

**`src/lib/read-recording.ts` reads them, and calls no model.** This is the
single most important fact about this product, and it is what the whole
8 Sep rebuild was for. The old path had an extraction model write `threads` —
a topic, a take, some quotes — and relog turned those into entries, so the
words on the log were a paraphrase of a paraphrase. The operator: *"the
problem with the old system was i didn't trust its output anyway."*

Now: `transcript_words` carries a start and an end for every word, so a gap
between two of them is a **fact about the recording** — he stopped talking
for two and a half seconds. That is the cut. A sentence end is a weaker
second cut, used only once a passage would otherwise be a wall (90 words),
and a hard ceiling at 140 catches a stretch with neither. Each passage
becomes one entry at `recorded_at + start`, `author='operator'`,
`grounded=1`, idempotent via `source_ref='said:<vlog>:<first word index>'`.

**A recording with no word timings writes nothing at all.** It could split
`transcript_text` on punctuation, and then every entry would carry a second
the log invented — the failure this product exists to avoid. It stays one
line saying he recorded, until it has been transcribed.

The honest limitation, stated because it is the trade: a pause is sometimes
the wrong boundary. He pauses mid-thought; he runs two thoughts together
without breathing. **The log is wrong about the boundary sometimes and never
wrong about the words** — which is the right way round, and is why merge and
split exist on an entry. A model would be wrong about the words too.

**The 4-gram grounding checker is gone too**, and its absence is the same
point: it existed to catch an extraction model's paraphrase being attributed
to him, and nothing paraphrases him any more. A line on the log IS the
transcript, not something checked against it. Do not reintroduce one — if a
new path needs a grounding check, that path is a generator and should not
exist.

`scripts/test/read-recording.mjs` — 20 assertions, in CI. Every word in
exactly one passage, the passages joined equal to the transcript, the same
recording always cut the same way, and — checked against the source with
comments stripped — no code path to `transcript_text` and no model call.


### A page is made when he names it

**A page is made when he names it, and only then.** `POST /api/v2/pages`
takes a name. Everything after attaches by that name appearing in an entry.
Seeding from `entities` and the librarian's `clusters` went with the
extraction engine and nothing replaced it: a page the log invented is the log
deciding what is significant in his life.

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
flag is the same lie the old reader told, with a real person on the
other end of it this time.

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

### An entry, readable as data

`src/lib/entry-schema.ts`, rendered on `/entry/[id]`. `footage.html`: "Also
readable as data: SocialMediaPosting — both dates, the author, and who wrote
the line. **in this page's source, not a separate feed**."

That parenthesis is the rule. A schema block generated from a different query
than the one the page rendered IS a second feed, and it can disagree with
what is on screen — so the block is built from the entry object the page
already holds, and a field the entry does not carry is absent rather than
filled in. A **private or held entry produces no block at all**.

Both dates survive: `dateCreated` is when it happened, `datePublished` is
when it entered the log. `author` is the operator only when he wrote the
line; a line the log composed is attributed to the log by name, in the data,
the same as on screen. A date the log had to guess travels as
`_neolog.date_precision` — there is no standard field for "approximately",
and emitting a confident ISO timestamp for a year-only guess would be a lie
in a format built to be trusted.

**The owner strip** (`src/components/OwnerStrip.tsx`, SPEC §3) sits on the
public-facing surfaces: *signed in · this is what a stranger sees · your log
→*. It carries no controls — a public page that grows an edit button has
stopped being what a stranger sees. `signedIn` is passed by the page, which
knows because it called an operator-only endpoint; when one of these is
served on a public path, that flag becomes false for a stranger with no
change here.

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

⚠️ **`tsconfig.workers.json` — the workers are typechecked separately, and
they must stay that way.** The root `tsconfig.json` excludes `workers/`, so
until 8 Sep nothing typechecked them at all: an edit could delete a library
both workers import and `tsc --noEmit` stayed green. `wrangler deploy`
transpiles with esbuild and does not typecheck either, so the failure surface
was a broken deploy. The first run of this config found exactly that — both
workers still importing `src/lib/surface`, which had just been deleted.
`workers/ffmpeg` is excluded because it depends on `@cloudflare/containers`
installed in its own package and shares no code with `src/`.

⚠️ **The worker deploy had been failing since 26 July** — six weeks, silently,
so the pipeline and healer on Cloudflare were running June code. Cause:
`wrangler@4.x` moved its peer to `@cloudflare/workers-types@^5` and the worker
packages still pinned `^4`, so `npm install` refused. If it goes red again,
read the resolution error before assuming it is your change.

`check-enum-values.mjs` covers the third: **a right column with a wrong
value.** The column checker catches `vlogs.transcript`; it cannot catch
`relation = 'reflection'` when the two values are `led_from` and `reflects` —
SQLite accepts the write, `tsc` accepts the comparison, `next build` is
green, and the only symptom is a reflection rendering as an event. It
validates both sides (`col = 'x'`, `col IN (…)`, `x.col === 'y'`) against the
value sets for eleven columns and prints the allowed set beside a failure.
Adding a value means adding it to the list on purpose, which is the point.
Also update `src/lib/log-entry.ts` — `RELATIONS`, `RELATION_DEFAULT`,
`REFLECTS` — rather than typing a string.

**Package inventory, 8 Sep 2026** — 74 distinct pages (excluding the 37
`e-*` entry examples): **43 built · 6 partial · 16 not built · 4 below the
fence · 5 meta**.

Partial: `fix` (per-word transcript editing), `branch` (splitting one note
into several), `audio` (no two-voice split — `transcript_words.speaker` exists
but nothing populates it; Whisper is not asked for diarization, so the split
cannot be built honestly yet), `flow` (a walkthrough page). `walk` and
`screenshots` are built.

**Not built, and each for a stated reason:**

- `elsewhere` — **declined.** Its three "moves" all draft a reply in his voice
  for posting on someone else's site, which is below the drafting fence with
  `letters`. What is left once those are removed is a static essay about
  which sites AI engines cite, which belongs in the design package rather
  than in the product — and a page whose subject is getting cited sits badly
  against §0 rule 7, *you never write something down because it would look
  good in public*.
- `repo`'s commits-folded-by-week — **declined.** It needs a GitHub
  connector, and the vendor list is locked to Cloudflare + Anthropic. A
  repository is already a `code` document whose body is the README.
- `audio`'s two-voice split — **blocked, not declined.**
  `transcript_words.speaker` exists and nothing populates it; Whisper is not
  asked for diarization. Building the split without it would mean guessing
  who said what, and the consent rule then attributes another person's
  sentence to him. The mechanism it needs already exists in
  `src/lib/correspondence.ts`.
- `photo` · `recording` · `question` — **served.** SPEC §3's "one design, two
  views: nothing is designed twice" makes these `/entry/[id]` plus the
  schema block, not new pages.
- `branch` — **served by `/walk/[id]`.** A split take's parts each `led_from`
  it, so the take's walk is branch.html's fan. The trace levels that page
  also shows (*a fact · a term · a position · a piece*) are the offer, which
  is below the fence.
- `image` · `image-filter` — the entry page renders an image entry whole, and
  the description is now correctable: **the log's wording is marked as the
  log's until he replaces it**, at which point the revision record makes it
  his. No second author column — that is derived from `entry_revisions`. `messages` and `writing` shipped — see
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

**The build order is void.** The operator lifted it on 7 Sep: *"go through
the whole thing and build the full system."* What remains unbuilt: **the fold rules past twenty**
(`log-2028.html`), the per-kind bodies, and everything below the drafting fence — letters, cuts,
the offer, anything that drafts in his voice. That last group stays below the
fence regardless.

---

## ⚠️ Locked architectural decisions — do not relitigate

These are settled. Read this section before proposing alternatives.

### One vendor: Cloudflare

Pages (hosting), R2 (the recordings), D1 (the log), Workers, Workflows,
Queues, Workers AI (Whisper, and the vision check on an uploaded image),
Access (auth), Containers (FFmpeg).

Anthropic is available as a paid opt-in and **nothing currently calls it**.

**Explicitly removed:** Supabase, Inngest, Groq, Replicate, OpenAI fallback,
ElevenLabs, fal.ai, AssemblyAI, Brave Search. Do not reintroduce.

### Operator + project identity

- **Custom domain:** `neolog.ai`
- **GitHub repo:** `crystalford/neolog`
- **Cloudflare Account ID:** `eda2e9bbd9acc42699027cfdcb50f998`
- **Cloudflare Access team:** `neolog` (sign-in at `neolog.cloudflareaccess.com`)
- **R2 bucket:** `neolog-videos` (contains 11.67 GB of vlogs — the only data that must be preserved)
- **Single operator** (not multi-tenant). No multi-user logic, no team features.

### Data philosophy

- **The recordings in R2 are the only thing preserved, full stop.** Not
  "across rebuilds" — on 8 Sep everything else was thrown away deliberately,
  because the old system's output was not trusted. Every other row is
  rebuildable from the files.
- The old Supabase user_id prefix (`b2df4f26-6dd8-421d-bb3d-db777086079b/`) in R2 stays in place. Code reads videos from wherever they exist in the bucket — no migration, no renaming.
- **No code path may delete an R2 object**, and `scripts/check-r2-safety.mjs`
  enforces it in CI: `deleteObject` may appear in `src/lib/r2.ts`, which
  defines it, and nowhere else. Three handlers had one on the morning of
  8 Sep — the per-recording DELETE, the bulk delete offering it for a whole
  selection at once, and the reset route's ancestor. All three bury the row
  and keep the bytes now. A confirmation dialog is not a defence against a
  code path that should not exist.

### Operator product decisions

- **Auth:** Cloudflare Access with one-time PIN to the operator's email. No
  signup flow, no public account creation, no public bypass apps.
- **Upload archive mode:** an upload can land `archived`, skipping
  auto-transcribe. Processing is then triggered per recording from its page.

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

---

## Surfaces — what actually shipped

The masthead is **three entries — home · search · index** — because that is
what `log.html` carries on every page of the design package. It grew to seven
once, then to a four-entry consolidation with a health pill and a dropdown of
destinations; all of that was the old product's dashboard. **An entry goes in
the nav only if a page in the package puts it there.** Everything else is
reached from the page it belongs to: the log's footer, an entry's rail, a row.

| Label | Route | What it is |
|---|---|---|
| **Log** | `/` | **Home — the log.** The composer on top (type, talk, drop files in; auto-grows from one line to a chapter; a `when` control for backdating with a precision — *that day / that month / that year* — so "2008 was a huge year" doesn't have to pretend to a day). Then the receipt: one line, one undo. Then search, the eight-way filter toolbar, the order toggle (*when it happened* / *when I logged it*), and the day-grouped feed. The rail carries the written-down bar (coverage by year — the door to thin years) and what arrived on its own. |
| **Now** | `/now` | The intake with nothing else on the screen — the signal-wave field, the slab, one hint after a few seconds in an empty field. No nav, no feed, no counts. Reached from *full screen* in the composer. |
| **An entry** | `/entry/[id]` | One entry, whole: both dates and the distance between them, who wrote each line, the file at full size, the transcript. The rail is the corrections — wrong date (a year alone is a complete answer), wrong words, who can see it, bury/dig up. **The fix lives where the mistake is.** |
| **Index** | `/pages` | Every name, place, project and subject on the log — each one a page. Banded into going-on-now / from-before / people / places; columns page · kind · span · entries · status. Status and span are derived on read so they cannot go stale against the counts. **A page is made when he names something** — `POST /api/v2/pages`. Seeding from what a model thought mattered is gone. |
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

**Past twenty, the years band too.** Twenty-eight year rows is still a flat
list past twenty, so consecutive *thin* years share one line — `bandYears()`
in `src/lib/fold.ts`, tested in `scripts/test/fold.mjs`. Thin means under a
fifth of the fullest year, which is where `log-2028.html`'s own numbers fall
(1,847 and 1,388 stand alone; 2001–2025 at ten to thirty a year band). Three
rules keep a band honest: **density only** — banding by meaning ("the years
at one company") would be the log reading his life, which §0 rule 3 forbids;
**a gap breaks a band**, because a year with nothing in it is not a row and a
band spanning it would imply coverage the log does not have; and **ten years
is the cap**, because "2001 – 2025" satisfies the rule and is useless. A band
says how many years it stands for as well as how many entries — 203 entries
over a decade and over one year are different facts. Opening one says out
loud when it is showing 500 of more.

**Detail pages** (reached from nav-page cards or deep-linked):
- `/vlogs` — the recordings themselves, reached from the avatar dropdown.
- `/vlog/[id]` — one recording, whole: the video played from R2 untouched, the
  word-timestamped transcript following the playhead, provenance in words
  (which of the four tiers dated it, who transcribed it), the entries the log
  read out of it, and one action — **read it onto the log**. Deleting buries;
  the file always stays.

**Settings** (`/settings`) — his one sentence (which `/facts` shows and will
not draft), where the files are kept, the recordings panel (**transcribe the
untranscribed · read them onto the log**, with the running counts), the two
maintenance jobs for a recording the pipeline dropped, and last, **Start
again**.

**Start again** is the one irreversible act in the product and it is a button
because the operator has no terminal — this session is his runtime, so a
`curl` is not an option and a migration that runs itself on the next deploy
is not acceptable. It drops every table the old system wrote into, removes
the entries that came out of recordings, and clears the derived columns. It
**does not touch R2**: `/api/v2/admin/reset-to-recordings` contains no
`deleteObject` and never may. The confirmation phrase is **"keep the
recordings"** — the thing being promised, not the thing being destroyed, so
typing it means reading the promise.

**Removed 8 Sep — every surface of the video-essay studio.** `/drafts`
`/published` `/studio` `/inbox` `/chat` `/ready` `/photos` `/about` `/system`
`/graph` `/entity/[id]` `/production/[id]` `/projects` `/subjects` `/topics`
`/clips` `/timeline` `/capture` `/uploads` `/p/[id]` `/podcast.xml` `/log`,
their APIs, their libraries and their tables. They do not redirect: a redirect
preserves a bookmark to a product that no longer exists.


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
| Async jobs | Cloudflare Workflows + Durable Object pipeline |
| Transcription | Cloudflare Workers AI Whisper (`whisper-large-v3-turbo`) — word-level timestamps, which the reader needs |
| **Reading a recording** | **No model.** `src/lib/read-recording.ts` cuts `transcript_words` at his own pauses. |
| Looking at an uploaded image | Llama 4 Scout via `callChat` — the hold-back check and the words out of a screenshot. It reports what is visibly there and nothing else. |
| Writing a search answer | `callReasoning()` in `src/lib/models.ts` — the one place a model writes prose, and every sentence's citations are checked in code before it is shown. |
| Video processing | Cloudflare Container Worker running FFmpeg (`workers/ffmpeg`) — transcode, thumbnail, audio extract |
| Auth | Cloudflare Access (one-time PIN to operator email). No public bypass apps — nothing is served publicly yet, and adding one is the operator's act. |
| Styling | Inline styles importing tokens from `src/lib/design.ts` |

---

## Design system

Pure black (`#000`), cool-gray foregrounds, **one signal colour: steel
`#4ea1d5`** (`SPEC.md` §1). Geist for everything; JetBrains Mono for dates and
IDs only — **never on a button or a control.**

**Tokens live in `src/lib/design.ts`.** Import from there; do not redefine
inline.

```typescript
import { INK, BONE, TOPIC, STATE, FONT_BODY, FONT_MONO } from '@/lib/design'
```

**Four rules from the design package's `plain.css`, binding:**

1. Nothing on screen below **10.5px**.
2. **No uppercase-letterspaced labels** — a label is a word, not a code.
3. **No accent stripe on any card edge.**
4. **One frame everywhere**: `max-width 1140px`, `padding 0 44px` → 1052
   inner, spent as 708 + 48 gap + 296 rail. Nothing reframes when you click.

⚠️ **There was a second, contradictory design vocabulary in this file until
8 Sep** — 56–92px heroes, uppercase letterspaced mono eyebrows, accent
stripes on cards. That was the old product's, it mandated exactly what rules
1–3 forbid, and it is why surfaces built at different times do not match. If
a page still has a giant hero or an uppercase eyebrow, it is a leftover.

**Every detail page answers four questions** — the work itself; where it came
from; where it sits; what it became. On a recording that is: the video, the
provenance in words, the pages it is on, and the entries read out of it.

---

## Database (Cloudflare D1)

Schema is `db/schema.sql` + the runtime migrations in `src/lib/migration-runner.ts`. Migrations run on first request per Worker isolate; safe to redeploy without manual steps.

**The tables, and there are not many:**
- **Identity**: `operator` — `email`, `handle`, `bio` (his one sentence, typed by him; `/facts` will not draft one), `tz`.
- **The log**: `log_entries` — the one entry shape, with `led_from`/`relation` for threads and `entry_revisions` beside it keeping what every correction replaced.
- **Recordings**: `vlogs` + `transcript_words`. `photos`, `attachments`.
- **Pages**: `pages` (+ `consent`, `consent_at`, `consent_note`) and `page_entries`.
- **Correspondence**: `correspondence`, `correspondence_messages`.
- **Made things**: `documents`, `document_drafts`.
- **The rest**: `month_summaries`, `recall_questions`, `operator_settings`, `background_jobs`, `pipeline_events`, `pipeline_jobs`, `schema_migrations`.

**Twenty-five tables were dropped on 8 Sep** — `threads`, `clusters`,
`entities`, `productions`, `topics`, `chat_*`, `voice_profiles` and the rest
of the extraction engine — from `db/schema.sql` as well as from D1, because
the bootstrap re-applies the schema on every run and would otherwise bring
them back empty. `POST /api/v2/admin/reset-to-recordings` is what removes
them from a live database. **Do not re-add one.** A dropped table returning
means a generator returned with it.

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
| `read-recording.ts` | **How a recording reaches the log, and there is no model in it.** Reads `transcript_words` and cuts at his own pauses. Never add a model call to this file. |
| `llm.ts` | `callChat()` — the vision call shape (`src/lib/vision.ts`, the hold-back check). |
| `transcribe.ts` | Whisper, with word-level timestamps — which `read-recording.ts` needs and without which a recording is not read at all. |
| `r2.ts` | R2 ops; `R2Env` interface includes presigned-URL helpers. |
| `d1.ts` | D1 query helpers (`getDb`, `findOne`, `findMany`, `run`, `batch`). |
| `access.ts` | Cloudflare Access JWT parsing → `requireOperator()`. |
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
- **Cloudflare only.** Refuse to reintroduce Supabase / Inngest / Replicate / ElevenLabs / fal.ai / OpenAI / AssemblyAI / Bing / GitHub-as-a-data-source — say so explicitly if asked. Anthropic remains available as a paid opt-in and nothing currently calls it.
- **No third-party touchpoint at all now.** Brave Search went with Topics.
- `export const runtime = 'edge'` on every Next.js route + page.
- Never hardcode API keys; they're Worker secrets.
- Large files go direct to R2 via presigned URLs — never through API routes.

**Models:**
- **There are three places a model runs, and that is all of them.** The
  hold-back check on an uploaded image (what is visibly on it); the words out
  of a screenshot; and the answer on `/search`, whose every sentence has its
  citations checked in code before it is shown. A fourth would need a reason
  written down next to it.
- **Never add a model to `read-recording.ts`.** That path is what the old
  product got wrong.

**Voice preservation:**
- **Nothing the operator said is ever cleaned up.** Hesitations, profanity,
  fragments and false starts stay. `read-recording.ts` copies the transcript's
  own words; anything that would "tidy" them is the bug.
- A line the log wrote is marked as the log's, always, including the ones that
  read naturally.

**Product invariants:**
- **Don't build a generator.** Not a draft, not a suggestion, not a "what
  should I make next", not a summary of a period, not a caption he did not
  write. That product existed here and he did not trust its output. If a
  feature needs a model to write prose in his voice, it is below the fence
  (`letters`, `thinkit`, `sayit`, `cut`) and stays there.
- **The log does not comment.** No counts pushed at him, no "you've mentioned
  this eleven times", no reading of what a number means (§0 rule 2).
- **Nothing is published anywhere.** `visibility='public'` is a flag on a row
  and every public surface still needs signing in. Making one genuinely public
  is one Cloudflare Access bypass app, and that act is his.
- **Never delete a recording's file.** Bury the row; the bytes in R2 are the
  only irreplaceable thing this product holds.
- Don't propose pg_dump / RLS / Supabase patterns — they don't exist here.
- Don't re-add a dropped table. If one comes back, a generator came back
  with it.

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
