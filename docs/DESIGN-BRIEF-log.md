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

## Ground truth — already live, refine this, don't reinvent it

- **`src/app/(app)/page.tsx`** (route `/`, "Log") — top of the page is
  now a compose box: starts as one line, auto-grows as you type (so
  "got a job" and a full autobiographical chapter use the same box),
  with an optional backdate field and a submit button. Below it, a new
  **"Your log"** section — a reverse-chronological feed of everything
  typed in, card-style, relative time under two weeks old ("2h ago"),
  absolute date beyond that. Below *that*, the existing "Ready to send"
  section (system-drafted productions) is unchanged.
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
2. **How a long entry reads in the feed vs. a short one.** Currently
   every entry gets identical card treatment, clipped at 8 lines. A
   one-line "got a job" and a 900-word memory of 2008 are extremely
   different objects and might deserve different visual weight in the
   feed — without introducing a stored "type" (see constraints above;
   any distinction should come from the content's actual length, not a
   new field).
3. **Home as a whole.** Three stacked sections (compose+feed, ready-to-
   send, and the auto-shipped ribbon when present) currently just sit
   in sequence. Does "Your log" deserve to be visually primary, with
   "Ready to send" reading as a secondary/system-generated tier beneath
   it? The product's center of gravity just shifted from the
   production engine to the personal record — the page hasn't
   caught up to that yet.
4. **Archive's mixed day view.** Text rows above a photo/video grid,
   per day, is the current mechanical solution. Is there a better way
   to show "here's everything from this day" when it's a mix of a
   sentence, a photo, and a 20-minute recording?

Ground every exploration in real content — pull actual entries and
vlog titles from the live app rather than placeholder text; the voice
and register of what's actually being typed in matters to how this
should look.
