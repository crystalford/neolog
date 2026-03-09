# Neolog 2.0: The Comprehensive Vision

> *"The medium is the message."*  — Marshall McLuhan

---

## The Philosophical Foundation

McLuhan's thesis was that every technology is an **extension of the human body**:
- The wheel extends the foot
- The book extends the eye
- The radio extends the ear
- The electric circuit extends the central nervous system

**Neolog extends the mind itself.**

Not a tool *for* your thoughts — a prosthetic *of* your cognition. It doesn't wait for you to organize. It *is* the organization layer running in parallel with your life, ingesting your raw output and making it legible — to you, and eventually to others.

This is not a productivity app. It's not a note-taker. It's not a CMS. It's a cognitive extension that accumulates, synthesizes, and represents you. The deeper implication: Neolog doesn't just capture what you think. Over time, it *describes* what you think better than you could describe it yourself.

---

## What Is This, Really? (The Honest Answer)

Neolog 2.0 is the intersection of three things that don't yet exist as one product:

| Domain | What exists today | What Neolog adds |
|---|---|---|
| **Lifelogging** | Rewind.ai (screen capture), Screenpipe, wearables | Video/audio brain dumps → structured intelligence, not just searchable logs |
| **PKM / Second Brain** | Obsidian, Notion, Logseq, Mem.ai | Passive accumulation (no manual filing), cross-session synthesis, contradiction detection |
| **AI Social / Portfolio** | Jasper, Buffer, Lately.ai | Posts *derived from actual live activity*, not from prompts. The system has ground truth — it knows what you did. |

No tool currently combines all three. The closest analogues:

- **Rewind.ai** — captures passively but creates a log, not intelligence. No synthesis, no entity accumulation, no publication.
- **Personal.ai (MODEL-1)** — "digital twin" concept but requires active setup and training. No video ingest pipeline.
- **Limitless** (ex-Rewind pivot) — meeting transcription + AI recall. Still reactive, not proactive.

**Neolog's positioning gap:** It's the only tool built around the workflow of a *creator who thinks out loud*. Messy, sprawling, video-first brain dumps → refined intelligence → autonomous publication. The creator is the input; the organized, marketed, socialized version of them is the output.

---

## The Core Loop (What Actually Happens)

```
You record a 30-min video brain dump   →   Neolog ingests
                                        ↓
                                   Transcribes (Whisper)
                                        ↓
                                  AI deep analysis
                                        ↓
                            Entities accumulate in the graph
                                   ↙          ↘
                         Your Intelligence     Your Output
                            Updates              Pipeline
                         (Brain view)         (Social, Posts,
                                               Portfolio)
```

Over hundreds of sessions, the graph becomes a searchable, queryable representation of your mind. Your projects, how they evolved. Your recurring questions. Your values as revealed by what angers you. The commitments you made and whether you kept them. The people who orbit your thinking.

---

## What It Extracts (The Full Taxonomy)

Each recording session feeds a growing entity graph. These are the entity types Neolog tracks:

### Identity Layer (the "who you are" graph)
- **Beliefs & Values** — revealed by friction and passion, not stated directly
- **Principles** — articulated frameworks you apply to problems
- **Self-concept** — how you describe yourself vs. how you describe who you want to be
- **Voice fingerprint** — the stories you tell repeatedly (these are your most powerful content)

### Work Layer (the "what you're building" graph)
- **Projects** — living documents that accumulate detail across sessions. Git-style versioning of ideas.
- **Skills** — being actively developed, demonstrated, explored
- **Innovations** — novel pivots or approaches (like the Supersample documentary pivot)
- **Methods** — how you approach problems, what patterns emerge

### Life Layer (the "how you're doing" graph)
- **Habits & Routines** — what you're doing, what you want to change
- **Energy patterns** — flow states vs. friction, creative peaks
- **Health signals** — sleep, exercise, stress markers mentioned in passing
- **Life events** — major things happening in the background of your thinking

### Intelligence Layer (the "how you think" graph)
- **Questions** — unanswered "what ifs" that float across sessions
- **Decisions & reasoning** — choices made and the logic behind them
- **Contradictions** — when you argue against something you previously said
- **Recurring themes** — topics that dominate across the last N sessions
- **Idea evolution** — how a concept mutates over weeks
- **Mental models** — frameworks you apply, even unconsciously

### Relationships (the "who is around you" graph)
- **People mentioned** — names, roles, frequency
- **Influence map** — who you keep quoting or crediting
- **Collaboration signals** — who you're working with on what
- **Relationship health** — positive vs. friction mentions

### Output Layer (what the graph produces)
- **Social Media Narrator** — AI-generated third-person posts describing your work, as an observer would
- **Portfolio entries** — project descriptions, written in your voice, from evidence
- **Living resume** — dynamically updated from actual demonstrated work
- **Content pipeline** — article angles, video topics, essay seeds drawn from your own thinking
- **Staggered social clips** — actual video clips extracted and queued for distribution

---

## The McLuhan Implication: The Medium Changes You

Here's the thing McLuhan would point out that most people miss: once you build this, the tool doesn't just represent you — it **changes how you think**.

Knowing that everything you say is being tracked, synthesized, and accumulated changes what you say. You start thinking *in sessions*. You start narrating your work more clearly because you know the system is listening. The log creates accountability. The contradiction detection changes how you reason. The commitment tracking makes you more likely to follow through.

The extension doesn't just amplify — it feeds back into and restructures the thing it extends.

This is why this isn't just a productivity tool — **it's an identity instrument**.

---

## What's Missing From What We've Built

Honest gap analysis:

### 1. The Identity Narrative layer (biggest gap)
We extract entities — but we don't yet generate the synthesis documents:
- A "living bio" that updates automatically
- A "project portfolio" with proper descriptions drawn from session evidence
- An "annual review" auto-generated from the year's sessions
- A "professional one-pager" that describes what you actually do

These are the *outputs* that solve the "I can't sell myself" problem. Right now we have entity data but no document generation layer on top of it.

### 2. Cross-session intelligence UI (not yet built)
The `entities` table exists but we have no visualization for:
- Relationship between entities (the actual graph, not just a list)
- Idea evolution over time (timeline of how a project idea changed)
- Contradiction surfacing ("On Feb 5 you said X, on Mar 3 you said the opposite")
- Commitment tracking ("You committed to this on Dec 12 — no mentions since")

### 3. The Social Narrator engine (partially described, not built)
We have "generated_posts" in the analysis output — but that's suggestions, not an actual posting pipeline. What's missing:
- Staggered queue (post 1 clip/post per day from the pool)
- Platform-specific reformatting (X vs. LinkedIn vs. Instagram caption)
- Third-person narrative mode ("He's building a system that..." vs. first person)
- Approval gate before anything posts (you review, it publishes)

### 4. Non-video ingest (no UI exists)
Daily notes, code commit logs, pasted chat conversations — these have no ingest path. Just a text dump endpoint, essentially. Need:
- A "today's log" quick-capture that accepts freeform text, pastes, uploaded text files
- A GitHub integration that reads commit summaries
- A "paste a conversation" mode that processes and extracts entities

### 5. Portfolio / resume generation (not started)
Given accumulated entities, GPT/Claude should be able to generate:
- A project case study (what it was, what you built, what you learned)
- A skills list with supporting evidence from sessions
- A bio: short (2 sentences), medium (paragraph), long (full story)

### 6. Replicate model IDs are broken
The current video processing pipeline uses a fake hash for the `fofr/toolkit` model. This will fail in production. The correct model is `fofr/toolkit:13d8a443`.

---

## What We've Already Built (Solid Foundation)

- TUS resumable upload (handles multi-GB videos)
- Inngest durable pipeline (won't timeout on Vercel)
- Whisper transcription with timestamps + chunking for large files
- PII scrubbing layer
- Full AI analysis prompt (20+ extraction dimensions)
- `entities` table with cross-session accumulation
- `clip_sessions` table for batch synthesis
- `synthesize-session` Inngest function (cross-clip narrative analysis)
- `assemble-clip` Inngest function (FFmpeg clip assembly via Replicate)
- Brain dashboard page (entity browser)
- Upload dashboard page (status polling, result viewer)

---

## The UI Philosophy

The UI should feel like a **control room for your mind**, not a productivity app:

- **Dark, dense, intelligent** — not clean and empty like Notion. More like a terminal or Bloomberg terminal aesthetic. Dense with meaning.
- **Timeline-first** — everything has a date. The primary view is chronological.
- **Everything is connected** — clicking an entity shows you every session it appeared in. Clicking a session shows you all entities that emerged from it.
- **Passive by default** — you shouldn't need to do anything except upload. The system surfaces patterns. You consume insights, not manage them.
- **Chat is the query interface** — the ultimate interface for querying your own graph is natural language: "What am I most excited about right now?" / "What did I decide about X?"

---

## Priority Order to Build Next

1. **Fix Replicate model hash** — blocks the video pipeline entirely
2. **Portfolio / narrative generation** — highest user value, biggest gap, directly addresses "I can't sell myself"  
3. **Cross-session timeline UI** — makes the accumulated data visible and interactive
4. **Social narrator + staggered queue** — the distribution layer that makes all of this external-facing
5. **Non-video quick ingest** — text dumps, pastes, notes
6. **GitHub / code activity ingest** — for tracking technical work automatically

---

*The goal of Neolog is not to organize your content. It's to extend your cognitive capacity until the gap between who you are and what you're able to demonstrate closes entirely.*
