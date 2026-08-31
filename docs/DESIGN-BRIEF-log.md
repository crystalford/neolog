# Design brief — the log vision refocus

*For a Claude Design session with this repo attached. Read this first —
it's the pivot that happened after the product docs were last written,
and it changes what's worth designing right now versus later.*

## What changed

neolog was pitched as an AI video-essay studio: talk into a camera, the
system finds clips and drafts productions. That's still true and still
works, but a long working session established something more
fundamental underneath it: **the product is a permanent personal
record — of what happened and what the operator actually thinks — and
the video-essay engine is one thing built on top of that record, not
the record itself.**

The concrete consequence: a new capture surface shipped tonight that
has nothing to do with video. Design's job now is to give that surface
— and the home page it lives on — a real visual identity, not to
invent new structure.

## Two real scenarios to design against

Not hypotheticals — these are the two actual ways this gets used, named
directly in conversation, and they pull in different directions:

1. **Real-time, in-the-moment logging.** "I got a job at a mushroom
   farm last Thursday" — typed or dictated in seconds, today's date or
   a near-today backdate, done. This is the X/Threads/Facebook-status
   register: fast, low-friction, a single thought.
2. **Retrospective autobiography.** "2008 was a huge year — a lot
   happened" — sitting down specifically to get years of un-recorded
   life into the record before it's lost. Long, possibly written over
   multiple sessions, backdated to a rough period rather than a precise
   day, closer in spirit to journaling or writing a memoir chapter than
   to posting a status update.

Both go through the *same* compose box today (see Constraints below on
why that's deliberate), but they're emotionally and functionally
different acts, and the design should hold both without favoring one
at the expense of the other.

## Ground truth — already live, refine this, don't reinvent it

- **`src/app/(app)/page.tsx`** (route `/`, "Log") — top of the page is
  a compose box: starts as one line, auto-grows as you type (so "got a
  job" and a full autobiographical chapter use the same box), with an
  optional backdate field and a submit button. Below it, **"Your log"**
  — a reverse-chronological feed, but **not text-only**: it's the same
  merged activity feed Archive uses (typed entries, recorded vlogs,
  photos), because recording a vlog is exactly as much a logged
  activity as typing a sentence. Each kind gets its own phrasing rather
  than one shared template — a typed entry shows as-is; a vlog shows
  "Recorded a video · 4:12" with its AI-derived summary underneath as
  a logline (`vlogs.summary` — a 2-3 sentence reframe the standard
  extraction pass already writes, previously surfaced nowhere); a photo
  shows "Added a photo" with its thumbnail. Below all of that, the
  existing "Ready to send" section (system-drafted productions) is
  unchanged.
- **`src/app/(app)/photos/page.tsx`** (route `/photos`, "Archive") —
  the existing day-grouped photo/video timeline now also shows these
  same log entries, read-only, as text rows above the visual grid for
  each day. No compose box here anymore — composing lives on `/` only.
- **`src/app/api/v2/log-entries/`** — the backend. One table
  (`log_entries`: `text`, `occurred_at`, nothing else required),
  merged into the existing `/api/v2/media` feed as a third item kind
  (`photo` / `video` / `update`).

These three surfaces are the actual design target. Everything else in
the app (production engine, Studio, Drafts, clip editor) is unchanged
and out of scope for this pass.

### The feed's kind list will keep growing — design for that

The principle behind merging vlogs and photos in: **any system event
that already has a timestamp is a free log entry** — no new capture UI
needed, just surface what's already there. Two more of these are known
and real, just not built yet, so the feed shouldn't be designed as if
three kinds (`update` / `video` / `photo`) is the permanent, final set:

- **A production getting published** — `productions.produced_at` /
  `published_to` already exist and are already timestamped. "Published:
  {title}" as a fourth activity kind is a small addition later, not
  part of this pass.
- **Location** — genuinely wanted, genuinely not free: no GPS is
  currently pulled from photo/video EXIF or stored anywhere. A real
  feature (parse EXIF GPS, reverse-geocode to a place name), not a
  surfacing job like the others. Don't design as if it exists yet.
- Further out: git commits, ingested AI chat sessions — same
  "already-timestamped, just needs ingesting" pattern, explicitly
  deferred (see the Claude-session/git-history idea earlier in the
  product conversation this brief comes from).

## Design system — reuse, don't redefine

Tokens live in **`src/lib/design.ts`** — import from there. Don't
introduce new colors, fonts, or spacing scales.

- Pure black ground (`#000`), cool-gray foregrounds, cobalt signal
  `#5b8df6`.
- Ten topic-territory colors (brass / terra / ochre / rose / plum /
  violet / steel / teal / sage / moss) — used to color-code content by
  subject elsewhere in the app; log entries currently have no topic, so
  don't force one onto them.
- Geist (300–700) for body/display, JetBrains Mono (300–600) for
  eyebrows, metadata, and timestamps.
- Eyebrows: 10.5px JetBrains Mono, 3.2px letter-spacing, uppercase.
- The existing masthead/nav pattern (`src/components/Masthead.tsx`) —
  four top-nav entries: Log · Archive · Drafts · Published. This pass
  doesn't add or remove nav entries.

## Constraints that are design decisions, not just philosophy

These came out of hours of working through the product tonight — they're
not arbitrary, and violating them visually would misrepresent what the
product actually does:

- **Raw and derived must stay visually distinguishable, always.** A
  typed entry is the operator's exact words, unaltered, forever. Any
  future AI-cleaned or summarized version of it is a *separate* thing
  sitting next to the original, never a replacement, and needs to look
  like a distinct, clearly-labeled artifact — never blended in as if
  it were the same object.
- **Reduction is a dial, not a fixed set of named levels.** Explicitly
  rejected tonight: a fixed "tagline / logline / timeline" schema per
  entity. If you're designing any kind of "zoom" or "expand" affordance
  for a log entry, it should read as continuous (more detail / less
  detail on request) — not as three or four discrete named tiers baked
  into the data model, because that structure doesn't exist and
  shouldn't be implied.
- **Capture must look as cheap as it is.** The compose box is the most
  important single element in this brief. It has to read as "text box,
  hit enter, done" — not as a form, not as something with required
  fields, not as a "new entry" flow with steps. The auto-grow behavior
  (one line → a full page) needs to feel like *the same action* at any
  length, not a mode switch.
- **No categories, no entry types.** There is no "life event" vs
  "thought" vs "note" distinction in the data. Don't design UI that
  implies one exists (icon pickers, type dropdowns, colored tags by
  kind) — it would be designing ahead of a decision that was
  deliberately left open.
- **Register: journal, not social feed, even though the layout
  borrows from one.** X/Threads/Facebook were named as the closest
  reference for the *mechanic* — type a line, it's on a timeline — but
  the actual purpose is closer to therapeutic journaling: getting
  things down so they stop circling, not performing for an audience or
  chasing engagement. No like counts, no streaks, no gamification, no
  visible metrics of any kind. It's private by default and it should
  feel private — calm, not stimulating.
- **Most of this will arrive as rough dictation, not clean prose.**
  The operator's stated working method is voice-to-text while driving —
  run-on, self-correcting, sometimes hard to parse on first read. The
  compose and display experience shouldn't assume tidy typed sentences;
  don't design typography or formatting that would make rough,
  unpunctuated dictation look broken or wrong.

## Explicitly out of scope — don't design these yet

Naming these so a design session doesn't wander into inventing
structure that hasn't been decided:

- Entity "dossiers" (a page per recurring person/project/topic with a
  tagline/logline/timeline) — concept exists, nothing is built, the
  exact shape is unresolved.
- Any kind of "arc" or period-spanning story unit distinct from a
  single dated entry.
- The AI "recontextualize this" pass (clean up rough dictation into
  a polished version) — real idea, deliberately deferred.
- A dedicated reader/viewer for the whole-corpus analytical read
  (`/api/v2/admin/corpus-read` — an admin-only endpoint that reads the
  operator's entire extracted record in one pass and finds patterns
  across it). It exists and works, but has no UI yet and isn't part of
  this pass.

## What's genuinely open for real design thinking

This is where a design pass can add real value, not just skin the
existing markup:

1. **The compose box's grow behavior.** Right now it's a functional
   `<textarea>` that resizes on input. What should the *feel* of going
   from a one-line quick capture to a full chapter actually be —
   does the rest of the page make room for it, does it take over, does
   the "Ready to send" section beneath it need to yield space?
2. **How a long entry reads in the feed vs. a short one.** Typed
   entries currently get one shared card treatment, clipped at 8 lines
   regardless of length — a one-line "got a job" and a 900-word memory
   of 2008 look identical except for how much they clip. They're
   extremely different objects and might deserve different visual
   weight — without introducing a stored "type" (see constraints above;
   any distinction should come from the content's actual length, not a
   new field). Separately, vlogs and photos now get their own
   kind-specific rows (an activity label, a thumbnail, the vlog's AI
   summary as a logline) rather than sharing the text card — that
   split is a first functional pass, not a resolved design.
3. **Home as a whole — and specifically, the seam between "Your log"
   and "Ready to send."** These aren't two views of the same kind of
   content: "Your log" is human-authored, exactly what the operator
   said; "Ready to send" is system-generated, the machine's suggestions
   drawn from the record. Stacking them as equal-weight sections
   blurs that distinction. Does the record need to visually read as
   primary and the machine's suggestions as clearly secondary/derived —
   and if so, what makes that legible at a glance, not just via section
   order?
4. **Archive's mixed day view.** Text rows above a photo/video grid,
   per day, is the current mechanical solution. Is there a better way
   to show "here's everything from this day" when it's a mix of a
   sentence, a photo, and a 20-minute recording?
5. **Date precision for retrospective entries.** The backdate control
   is a native day-precision date picker. "2008 was a huge year"
   doesn't have a specific day — right now the honest option is picking
   an arbitrary day in 2008 and eating the slight inaccuracy in how
   it's displayed later. Is there a lightweight way to capture "just
   2008" or "sometime that spring" without inventing a whole precision
   field/schema? (This is a real unresolved question, not a solved one
   with an obvious answer — worth sitting with rather than papering
   over.)

Ground every exploration in real content — pull actual entries and
vlog titles from the live app rather than placeholder text; the voice
and register of what's actually being typed in matters to how this
should look.
