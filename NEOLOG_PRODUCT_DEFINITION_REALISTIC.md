# NEOLOG.AI — Realistic Product Definition (V1 + VNext)

Date: 2026-01-05  
Codename: Sovereign Node (Reframed: **Interoperable Publishing Node**)

## 0) Summary
Neolog is a **content supply chain** for intellectual output.

- **V1** ships a reliable pipeline: **Ingest → Triage → Draft → Publish → Generate distribution assets**.
- **VNext** adds the “agentic” layer as **jobs/automations** (observable, retryable, idempotent), not as hand-wavy autonomous agents.

This document keeps the original metaphor (3 stations) but tightens requirements into buildable, supportable features.

---

## 1) Core Philosophy (Keep)
Neolog is not “just a publisher”. It is a system to:

1. **Capture high-signal inputs** while preserving provenance.
2. **Transform inputs into drafts** using assistive tools.
3. **Ship outputs everywhere** with channel-specific assets.
4. **Expose interoperable surfaces** so external tools can read/write.

### Non-negotiables
- **Attribution is currency**: nothing enters the system without provenance metadata.
- **Interoperability-first**: content is accessible in machine-friendly formats.
- **No “For You” feed scraping**: ingest is manual capture + targeted monitoring only.

---

## 2) The 3-Station Model (Buildable Requirements)

### STATION 1 — INGEST (Loading Dock)
**Goal:** capture artifacts while strictly preserving provenance metadata.

#### V1 Inputs (ship these)
- **Manual capture** (UI): paste URL / paste text / create inbox item.
- **RSS/Atom sources**: scheduled pull into inbox.
- **Webhook ingest** (API-key secured): external systems push artifacts.

#### V1 Artifact Shape (required fields)
Every ingest creates an **Inbox Artifact** with:
- `source_type` (rss | manual | webhook | …)
- `source_url` (where it came from)
- `canonical_url` (the canonical content URL, if applicable)
- `raw_data` (normalized payload; never throw provenance away)
- `status` (new | imported | ignored)

#### Pushback / realism
- “X Lists monitoring” is **VNext** and only with official API access.
- Web scraping (Firecrawl-style) is feasible, but best shipped as **manual URL → markdown extraction** first.

---

### STATION 2 — CORE (Factory Floor)
**Goal:** turn artifacts into high-quality drafts with optional assistance.

#### V1 Core Workflow (ship these)
- **Inbox → Draft** conversion (single + bulk)
- Choose destination publication
- Preserve provenance by storing:
  - `canonical_url`
  - `original_source`
  - any relevant source payload in `raw_data`

#### V1 “Vault” reality check
In the long-term spec, the vault is described as a “Knowledge Graph”. That’s **not V1**.

**V1 Vault should be:** a typed library of assets with provenance and tags, plus optional embeddings for retrieval.

- Asset types: `prompt`, `image`, `code`, `text`, `link` (extensible)
- Minimal features:
  - add asset (API + UI)
  - tag asset
  - search asset (text search; embeddings optional)
  - attach assets to drafts

#### Content format realism
Avoid making ProseMirror JSON canonical in V1.

- **V1 canonical storage:** `markdown` or `html` text (stable, portable)
- Optional: store editor-specific JSON as a secondary representation later.

#### “Audit agent” realism
Ship audits as **on-demand tools** (button-press), not autonomous background agents.

---

### STATION 3 — BROADCAST (Shipping)
**Goal:** generate channel-specific assets and optionally distribute.

#### V1 Broadcast (ship these)
- Generate a **Distribution Pack** (thread, LinkedIn post, newsletter copy, hooks, OG variant)
- Keep it **reviewable** in UI

#### V1 Distribution (careful)
- “Send email” / “Post to social” should be VNext unless reliability + compliance + user consent UX is fully designed.

#### Git backup realism
- V1: **export bundle** (zip of markdown + metadata + assets)
- VNext: GitHub sync (auth + conflict strategy + key management)

---

## 3) Interoperability Standards (Neolog for Robots)

### A) Reading Room — `/llms.txt`
**Goal:** external tools consume content without scraping HTML.

V1 requirements:
- Publish a machine-friendly index of evergreen content
- Include lightweight metadata (title, canonical url, published date, tags)

### B) Drop Box — inbound draft webhook
**Goal:** push drafts into Neolog from external AI workbenches.

V1 endpoint shape:
- `POST /api/webhooks/draft` (or `/api/inbox/webhook` as the ingest primitive)

V1 payload:
```json
{
  "title": "…",
  "content": "…", 
  "content_type": "markdown",
  "tags": ["…"],
  "source_tool": "Google AI Studio",
  "canonical_url": "…",
  "source_url": "…",
  "meta": { "provenance": { "tool": "…", "session": "…" } }
}
```

Design note: if Neolog stores this as an inbox artifact first, it stays consistent with the supply-chain pipeline.

### C) Asset API — programmatic vault capture
**Goal:** scripts can push assets (images/prompts/snippets) with provenance.

V1 endpoint shape:
- `POST /api/vault/add`

---

## 4) Data Model — V1 vs VNext

### What already exists (current direction)
- `posts` (draft/published)
- `post_embeddings` (semantic index)
- `post_distribution_packs` (broadcast assets)
- `feed_sources`, `inbox_items` (ingest + triage)

### V1 additions (recommended)
1) `assets`
- `id`, `user_id`, `type`, `content`, `meta jsonb`, `tags text[]`, timestamps

2) `post_assets` join table (preferred over `assets_used uuid[]`)
- scales better, supports ordering + annotations

### VNext additions (to make “agents” real)
A proper job substrate:
- `jobs` (definition: type, user_id, enabled, config)
- `job_runs` (status, started_at, finished_at, error, metadata)
- Idempotency keys + retry strategy + dead-letter handling

This is the difference between “agents as marketing” and “agents as reliable automation”.

---

## 5) Sitemap (V1)
Keep it simple and aligned to user workflows.

- `/dashboard`: briefing + recent drafts + quick ingest
- `/inbox`: triage artifacts → convert to drafts
- `/write`: editor
- `/publish` (optional): review distribution pack + syndication assets
- `/sources`: RSS source management
- `/settings/api`: API keys + webhook credentials
- `/vault` (V1 if assets ships): asset library + add/search/tag

---

## 6) Hard Constraints (Operational)
- BYOK provider keys (no shared keys by default)
- Rate limits + usage caps for all AI calls
- Every background action must be:
  - retryable
  - idempotent
  - observable (logs)

---

## 7) Phased Delivery

### Phase 1 (V1) — Supply chain that works end-to-end
- Ingest (manual + RSS + webhook) → Inbox
- Inbox triage + bulk convert → Drafts
- Fast publish
- Distribution pack generation
- `/llms.txt`

### Phase 2 (VNext) — Vault + true automations
- Assets (vault) + attach assets to drafts
- Asset API
- Jobs substrate + audit trail
- Optional distribution integrations (email send, syndication posting)

---

## 8) Language / Positioning (Recommended)
Use precise words that match real reliability:
- “Agents” (marketing) = “Automations” (product)
- “Knowledge graph” (future) = “Asset Vault + semantic retrieval” (now)
- “Autonomous” (future) = “on-demand + scheduled jobs with logs” (now)
