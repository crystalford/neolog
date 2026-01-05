# Neolog Roadmap

Last updated: 2026-01-05

## Supply Chain Versions (MVP slices)
### Version 1 - Writer MVP
- Ingest: Firecrawl URL import -> draft
- Core: Editor + OpenAI summaries (BYOK)
- Broadcast: X threader + Resend newsletter

### Version 2 - Media MVP
- Ingest: Deepgram audio notes
- Core: Anthropic critique
- Broadcast: LinkedIn + Spotify audio articles

### Version 3 - Video MVP
- Ingest: Gemini video summary
- Broadcast: TikTok/Instagram video outputs

## Phase 1 - Distribution Pack (shipping)
- [x] Deterministic pack generation (X/LinkedIn/Reddit + hooks)
- [x] OG image data URL (SVG)
- [x] Editor modal + dashboard entry point
- [x] AI pack generation (requires OPENAI_API_KEY)

## Phase 2 - Comment Curator (shipping)
- [x] Reddit import (top comments)
- [x] Manual highlights
- [x] Filters + sorting + pinning
- [ ] X import (requires paid X API)

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
- [ ] Usage tracking per provider (optional caps)

## Optional / Future
- [x] Post health system (freshness score + revive queue)
- [ ] Auto-post syndication (requires platform APIs)
- [ ] Programmatic visuals engine

## Neolog for Robots (prioritized)
1. AI Vault (BYOK) + context.md injection (now)
2. Sources + Inbox (RSS pull) (done)
3. Headless Inbox webhook (done)
4. llms.txt + ?format=json (done)
5. Agent-scoped API keys + automation triggers (done)
6. Accept: text/markdown responses (next)
7. Vector search endpoint (later)
8. MCP server integration (later)

## Cost-Gated Features
- AI summaries (OpenAI)
- AI distribution pack
- X import (paid API)

## Heavy Hitters (planned)
- [x] Resend (newsletter delivery, BYOK)
- [x] PostHog (analytics, BYOK)
- [x] Groq (speed, BYOK for expand)
- [x] R2/S3 (sovereign storage, BYOK settings)
- [ ] HeyGen/Synthesia (video avatar, BYOK)
