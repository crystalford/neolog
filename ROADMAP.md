# Neolog Roadmap

Last updated: 2026-01-05

## Supply Chain Phases (realistic)

### Phase V1 — Interoperable Publishing Node (ship + harden)
- Ingest: manual capture + RSS/Atom sources + API-key webhook (Inbox artifacts)
- Core: Inbox triage + bulk convert → drafts
- Publish: fast publish + background side-effects
- Broadcast: distribution pack generation (reviewable)
- Interop read: /llms.txt

### Phase VNext — Vault + Automations (make “agents” real)
- Vault: assets table + API + (later) UI
- Attach assets to drafts/posts (join table)
- Automations substrate: jobs + job runs + retries + logs + idempotency
- Optional distribution: sending/posting integrations only after reliability/consent UX

---

## v3.1 Alignment (vision reference; incremental)

The v3.1 vision describes a 6-layer pipeline:
`CAPTURE → ORGANIZE → MONITOR → COMPOSE → DISTRIBUTE → ANALYZE`

This repo already covers a meaningful subset of that pipeline. The goal is to **preserve shipped supply-chain features** and convert the remaining “vision gaps” into concrete roadmap items.

### What’s Already Built (v3.1 mapping)
- **Capture**: `POST /api/capture` and `POST /api/vault/add` (API-key or session auth); RSS ingest into Inbox
- **Organize**: Publications + publication-scoped Vault assets + filters + assignment UI
- **Compose**: Rich editor + drafts/posts + asset attachment workflows
- **Distribute**: Distribution pack generation; best-effort auto-syndication to Medium + Dev.to
- **Analyze**: Platform/site analytics surfaces (PostHog + internal dashboards)

### Major Gaps vs v3.1 (prioritized)
- **Monitor system**: first-class monitors + monitored-items review queue + “promote to Vault” workflow
- **Platform Connections**: OAuth/keyed connections per platform (as product surface), not just “generate pack”
- **Distributions ledger**: persisted per-platform distribution records + status + retries + errors
- **Engagement sync**: pull likes/views/comments per distribution and roll up by publication
- **Lineage analytics**: asset → post → distribution attribution and per-asset impact reporting
- **Quick capture UI**: global quick-add modal / command entry (e.g., ⌘K) and bulk import UX

### Near-Term Work (safe + compatibility)
- Add `/api/v1/capture` alias to align docs/spec clients with existing capture behavior
- Harden capture/vault contracts (response shapes + examples) without breaking existing clients
- Start Monitors v0 with the already-shipped RSS substrate (review queue + promote-to-vault)

## Phase 1 - Distribution Pack (shipping)
- [x] Deterministic pack generation (X/LinkedIn/Reddit + hooks)
- [x] OG image data URL (SVG)
- [x] Editor modal + dashboard entry point
- [x] AI pack generation (requires OPENAI_API_KEY)

## Phase 2 - Comment Curator (shipping)
- [x] Reddit import (top comments)
- [x] Manual highlights
- [x] Filters + sorting + pinning
- [x] X import (requires paid X API)

## Phase 3 - Digital Garden (shipping)
- [x] "Where this fits" on post pages (tags + related posts)
- [x] Profile topic map
- [x] /@user/topics hub
- [x] Topic intro editor (custom per tag per author)

## Phase 4 - Variable Density Reading (shipping)
- [x] Summary vs Full toggle
- [x] Key takeaways bullets
- [x] "On this page" anchors
- [x] AI summaries (requires OPENAI_API_KEY)
- [x] Expand sections (requires OPENAI_API_KEY)

## Phase 5 - BYOK Vault + Cost Router (shipping)
- [x] Integration key encryption at rest
- [x] Provider vault UI (labels, active key, rotation)
- [x] Cost router (user key -> managed key if Pro)
- [x] Usage tracking per provider (optional caps)

## Optional / Future
- [x] Post health system (freshness score + revive queue)
- [x] Auto-post syndication (requires platform APIs)
- [x] Programmatic visuals engine

## Neolog for Robots (prioritized)
1. AI Vault (BYOK) + context.md injection (now)
2. Sources + Inbox (RSS pull) (done)
3. Headless Inbox webhook (done)
4. llms.txt + ?format=json (done)
5. Agent-scoped API keys + automation triggers (done)
5.1 OAuth signup onboarding w/ username selection (done)
5.2 Account deletion cascades via auth user delete (done)
6. Accept: text/markdown responses (done)
6.1 Agent search endpoint (done)
7. Vector search endpoint (done; requires pgvector migration + OPENAI_API_KEY)
7.1 Auto-embed on publish (done)
8. MCP server integration (done)

## Next Build Targets (near-term)
- Drop Box: `POST /api/webhooks/draft` (API-key) to create inbox artifacts (drafts via conversion)
- Vault: `POST /api/vault/add` + `assets` table (BYOK provenance-first)
- Automations: introduce `jobs`/`job_runs` (minimal), then migrate cron routes onto it

## Cost-Gated Features
- AI summaries (OpenAI)
- AI distribution pack
- X import (paid API)

## Heavy Hitters (planned)
- [x] Resend (newsletter delivery, BYOK)
- [x] PostHog (analytics, BYOK)
- [x] Groq (speed, BYOK for expand)
- [x] R2/S3 (sovereign storage, BYOK settings)
- [x] HeyGen/Synthesia (video avatar, BYOK)

## Integrations Catalog (source of truth)

This section is the canonical list of real integrations in the codebase.

Legend:
- **Shipped**: implemented end-to-end (routes + data + UI where applicable)
- **Key slot only**: you can store keys in Settings → AI Vault, but no product feature uses it yet
- **Planned / demo-only**: mentioned in roadmap or screenshots, but not implemented

### Shipped (implemented)
- Supabase (Auth + Postgres + RLS; service-role admin operations)
- OpenAI (summaries, expand, distribution packs, embeddings + vector search)
- Groq (LLM provider option via vault)
- Resend (subscribe confirmations + publish notifications + weekly digest cron)
- PostHog (analytics via BYOK)
- X API v2 (comment import for posts; requires paid X API)
- Reddit (comment import via public JSON)
- Medium (auto-syndication on first publish; stored in `post_syndications`)
- Dev.to (auto-syndication on first publish; stored in `post_syndications`)
- HeyGen (video avatar jobs: create/status/webhook)
- Synthesia (video avatar jobs: create/status/webhook)
- Cloudflare R2 + Amazon S3 (presigned uploads; storage connection + vault secret)
- RSS (sources + cron pull into inbox; global RSS feed)
- MCP server (local integration in `scripts/mcp/server.mjs`)

### Key slot only (vault supports storing keys, feature not wired yet)
- Anthropic (Claude)
- Perplexity
- Grok
- Replicate
- ElevenLabs
- Stability (legacy)

### Planned / demo-only (not implemented)
- Deepgram audio notes ingest
- Gemini video summary ingest
- Auto-post to X/LinkedIn/Reddit/Threads (currently Neolog generates copy; only Medium/Dev.to auto-post today)
- TikTok/Instagram video outputs
- Firecrawl URL scraping (docs mention it, but current ingest uses built-in fetch + HTML strip)

### Non-API “integrations” (embed/support only)
- Rich embeds: YouTube, Vimeo, Spotify, Loom, Figma, Gist (iframe/embed rendering; no keys)
