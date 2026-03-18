# Competitive Intelligence — What the Market Gets Wrong

_Last updated: 2026-03-18_

---

## The Landscape

### Notion
**What they do well:** Brilliant organizer. Infinite flexibility with blocks, databases, templates. Best-in-class manual knowledge management.

**What they don't do:**
- Everything is manual input. Zero voice-to-doc synthesis.
- Pages don't update themselves. Once written, static.
- No source provenance — can't trace "why does this sentence exist?"
- No cross-document temporal awareness — doesn't know your project has evolved.

**Lesson for Neolog:**
The organization layer matters enormously. But the key gap Notion will never fill is *source provenance* — every claim in a living document should embed a timestamp link back to the exact recording where it was said. That's structurally impossible for Notion to add because Notion has no input pipeline.

---

### Linear
**What they do well:** Best-in-class issue/decision tracking for teams. Cycles, priorities, statuses, integrations. The gold standard for software project management.

**What they don't do:**
- Requires 100% manual entry. Every issue, every comment, every status update is human labor.
- No voice integration. No "I talked for 30 minutes about the roadmap" → issues.
- Tracks *what* but not *why* — decisions lack reasoning.
- No temporal arc across sessions: can't detect "you said X three weeks ago but contradicted it today."

**Lesson for Neolog:**
Linear tracks decisions and status changes over time — that's the right model. Neolog already extracts `decisions` and `blockers` per upload. The next step: decision *lifecycle*. Did that decision get implemented? Reversed? Superseded? A decision timeline no other tool has. Also: Neolog should be able to export a set of action items as Linear-ready issues.

---

### Mem.ai
**What they do well:** Synthesizes text notes, auto-links related content, AI-powered search across all notes. Best attempt at a "second brain" for text.

**What they don't do:**
- Still entirely text-based input. No voice-first capture.
- Synthesis is reactive, not proactive — it connects what you write, but you still have to write it.
- No temporal delta awareness — doesn't surface "last week you believed X, this week you believe Y."

**Lesson for Neolog:**
Mem's "smart" part is auto-surfacing connections between notes. Neolog has this data already in `entity_mentions` — every entity is connected to every upload it appeared in. The UI to *explore* those connections (the entity graph) is underdeveloped. Semantic search across all transcripts is a natural moat.

---

### Rewind AI
**What they do well:** Records everything (screen + audio), transcribes it all, searchable. The most complete capture layer available.

**What they don't do:**
- Zero synthesis. It's a searchable archive, not an intelligence system.
- No structure extraction — decisions, projects, goals, people don't accumulate.
- No cross-session pattern recognition.
- No output layer — you can find things, but nothing is generated from them.

**Lesson for Neolog:**
Rewind is Neolog without steps 4–17 of the processing pipeline. Good reminder that the *entire moat* is in the analysis and synthesis layer. The capture and transcription are table stakes. Don't under-invest in synthesis depth.

---

### GitHub Copilot Workspace
**What they do well:** Generates structured docs (specs, plans, tests) from code context. AI-native workspace for engineering tasks.

**What they don't do:**
- Code context only. Not voice. Not personal.
- One-shot generation, not a living accumulating document.
- No entity tracking across sessions.

**Lesson for Neolog:**
Context-driven generation works. Copilot Workspace generates PRD-like docs from code context. Neolog's project documents can generate the same output — but from *voice context*. The export layer should let Neolog output in formats that plug into existing tools: Notion-importable markdown, Linear issues, GitHub-compatible specs.

---

## The Unified Insight

| Tool | Input | Synthesis | Temporal Awareness | Output |
|---|---|---|---|---|
| Notion | Manual text | None | None | Static pages |
| Linear | Manual entries | None | Basic (issue history) | Issue tracker |
| Mem.ai | Text notes | Moderate (linking) | None | Search + linked notes |
| Rewind AI | Voice/screen | None (archive only) | None | Search |
| Copilot Workspace | Code | Strong (one-shot) | None | Specs/plans |
| **Neolog** | **Voice-first** | **Strong + accumulating** | **Cross-session delta** | **Living docs + video** |

Neolog is the only tool that closes the full loop: **voice in → structured intelligence out, compounding over time**.

---

## Features This Analysis Informs

### 1. Decision Lifecycle Tracking *(from Linear)*
Linear tracks issue states. Neolog should track decision states.

- Each decision extracted from a recording gets a status: `made → implemented | reversed | superseded`
- When a new recording contradicts or fulfills a past decision, the synthesis function detects the arc
- The project document decisions log shows not just "what was decided" but "what happened to it"
- This is something Linear can't do for voice and Notion can't do at all

### 2. Timestamp Backlinks in Project Docs *(gap vs. Notion)*
Every sentence in a synthesized project document should cite its source.

- `decisions_log` and `action_items` already have `source_upload_id` — add `source_timestamp_seconds`
- The synthesis function gets transcript segments, can identify the timestamp where a claim originates
- UI renders small linked citation: clicking navigates to `/dashboard/timeline/${upload_id}?t=${seconds}`
- Notion can never do this. It has no input pipeline to trace back to.

### 3. Export to Linear / Notion / Markdown *(from Copilot Workspace + meet-users-where-they-are)*
Neolog should output to where users already work.

- `action_items` → Linear issue CSV / JSON
- Full project document → Notion-paste markdown with proper heading hierarchy
- Clean markdown export for any tool (Obsidian, Roam, Logseq, GitHub issues)
- Lowers friction: Neolog becomes the *source of truth* that feeds existing tools, not a replacement

### 4. Semantic Search Across Transcripts *(from Mem.ai)*
Search all transcripts and entity mentions by meaning, not just keyword.
- "Find recordings where I talked about pricing" → returns relevant segments
- Backlog item: requires embedding pipeline (future)

### 5. Delta View: What Changed Since Last Week *(unique Neolog capability)*
- "What changed about Project X since last Monday?" → diff between old synthesis and new
- No other tool has this because no other tool accumulates living docs from voice
- Backlog item: requires storing synthesis history

---

## What This Means for Priorities

Build #1–3 now (decision lifecycle, timestamp backlinks, export). They directly serve the core loop and create differentiation no competitor can match structurally.

#4 and #5 are the true moat. Build after the foundation is solid.
