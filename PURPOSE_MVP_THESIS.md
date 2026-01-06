# Neolog — Purpose + MVP Thesis (Jan 2026)

## Purpose (the non-negotiable why)
Neolog exists to make AI-assisted creation *coherent over time*.

Frontier models generate fast and fluidly. What they do not reliably do is:
- preserve meaning across months/years
- prevent semantic drift across projects
- maintain provenance and standards
- keep a stable “source of truth” you can design against

**Neolog is not an AI.**
**Neolog is infrastructure that AI cannot be:** a memory + authority layer that turns fluid output into committed artifacts and tracks how those artifacts propagate across channels.

## Positioning (what we’re building vs what we’re not)
**Neolog is downstream of generation and upstream of commitment.**
- You can generate anywhere (Claude/ChatGPT/Gemini).
- Neolog is where ideas become **canonical artifacts** and where distribution becomes **instantiation with lineage**.

Neolog should never be framed as “a better ChatGPT.”
Neolog wins by enforcing standards and preserving meaning across time.

## The wedge (the thing competitors don’t do)
Buffer/Hootsuite schedule posts.
Notion/Obsidian store notes.
Claude/ChatGPT generate drafts.

**Neolog governs artifacts and their lineage:**
- one canonical source → many platform manifestations
- explicit provenance (what it was derived from)
- explicit references (what terms/claims it uses)
- feedback loop from performance → what becomes canonical

## The irreversible artifact (the moat)
If Neolog doesn’t produce something stable and enforceable, it becomes optional.

Lead with one “hard” object type that can be versioned + referenced + locked:

### Option A (recommended): Canonical Term
A Term is a governed language object.
- definition, scope, allowed usage, sources
- status: draft / canonical / locked / deprecated
- version history (edits are versions, not silent overwrites)

### Option B: Canonical Claim
A Claim is a reusable assertion with sourcing + constraints.
- “Housing supply is X% below demand (Canada, 2020–2024)”
- must cite source(s); can be invalidated/deprecated

Neolog can support both, but **MVP should pick one** to avoid a fuzzy product.

## MVP thesis (what we must prove first)
MVP is successful if a creator can:
1) publish repeatedly across multiple channels
2) with less rework and less drift
3) because their work is anchored to canonical objects

**MVP is not “writing in Neolog is nicer than Claude.”**
MVP is: “Neolog prevents me from reinventing language and redoing work.”

## North-star metric (measures purpose, not activity)
Choose one primary metric:
- **Instantiations per Canonical Artifact** (weekly)

Supporting metrics:
- % of published posts that reference ≥1 canonical object
- drift incidents caught per week (undefined term / conflicting definition)
- reuse rate: canonical objects referenced in multiple publications

## The daily workflow (how it should feel)
1) Generate drafts anywhere.
2) In Neolog: attach drafts to canonical terms/claims (or propose new ones).
3) Neolog runs a compliance check (undefined terms, deprecated terms, conflicts).
4) You commit a canonical artifact (or a new version).
5) You distribute as instantiations to X/YouTube/LinkedIn/etc.
6) Analytics roll up by canonical artifact + instantiation type, not just by post.

## Integrations (make Neolog live inside AI tools)
Neolog should be queryable from AI sessions, not a parallel workspace.

Minimum viable MCP toolset:
- `neolog.search_terms(query)` → canonical terms + statuses
- `neolog.get_term(slug|id)` → definition + constraints + version
- `neolog.check_draft(text, publicationId)` → undefined/deprecated/conflicts
- (gated) `neolog.propose_term_version(termId, proposedDefinition, rationale)`

This makes AI output *comply* with your standards instead of constantly reinventing them.

## Concrete backend primitives to build next (3–5 items)
These are deliberately minimal and compatible with the existing v3.1 pipeline.

1) **Canonical object model (terms or claims)**
   - `canonical_terms` (or `canonical_claims`)
   - stable `id`, `slug`, `status`, `publication_id`, `created_by`, timestamps

2) **Versioning as a first-class table**
   - `term_versions` / `claim_versions`
   - append-only versions with `version_number`, `diff/summary`, `created_by`

3) **Reference edges (who uses what)**
   - `artifact_references` (many-to-many)
   - post/draft/version → references → term/claim

4) **Instantiation + lineage**
   - `artifact_instantiations`
   - canonical artifact → platform instance (X thread, YouTube script, etc)
   - stores platform IDs + publish state + derived-from pointers

5) **Compliance checks (semantic audits)**
   - `semantic_checks` (or `draft_checks`)
   - results: undefined terms, deprecated usage, conflicts, missing required citations

If you build only these, you can already deliver the “authority layer” without rewriting the product.

## Next engineering steps (narrow, shippable)
1) Pick MVP canonical object: Term vs Claim.
2) Add tables + Supabase RLS for canonical objects + versions.
3) Add a draft “check” endpoint that returns violations (fast, no UI required initially).
4) Extend distribution to create an instantiation record per publish.
5) Add MCP read tools for terms + check-draft.

## Scope guardrails (what not to build yet)
- Don’t build a full-blown ontology/knowledge graph UI.
- Don’t build “AI writing” features that compete with Claude.
- Don’t build elaborate governance workflows before you have reuse/instantiation data.

## One sentence you can put on the homepage
Neolog turns AI output into canonical, versioned artifacts—and tracks how those artifacts perform across every place you publish.
