# Neolog Master Architecture

Version: 3.1 (Technical Definition Release)  
Last updated: January 2026  
Core philosophy: "Not a blogging tool. An Operating System for Intellectuals."

## 1) Product Vision
Neolog is a protocol-native publishing platform for the sovereign creator. It combines:
- Federated headless CMS
- Personal data store (PDS) patterns
- Distribution-first workflows

### Signal Flow (Content ETL)
**Ingest (Senses)**  
Data aggregation + normalization: webhooks, API scrapers, audio processors.

**Core (Brain)**  
Structured content repository + knowledge graph: relational storage, version history, semantic links.

**Broadcast (Voice)**  
Syndication engine: transforms internal JSON into platform formats (email, threads, RSS, etc).

## 2) Design System (Crystal Ford)
**Vibe:** high-end, cinematic, glassmorphism, data-dense.  
**Palette:**
- Ingest: Blue
- Core: Purple
- Broadcast: Emerald
- Error: Red

**Typography:**
- UI: Inter / Geist
- Metrics: JetBrains Mono

**UX principles:**
- Optimistic UI (local state updates, async sync)
- Telemetry over navigation (status + sync times)
- Visual pipes (signal flow connectors)

## 3) Stack
- Frontend: Next.js 14, Tailwind, Lucide
- Backend: Supabase (Postgres, Auth, Realtime)
- Storage: Cloudflare R2 (S3-compatible)
- Edge: Supabase Edge Functions (Deno)
- Email: Resend

## 4) BYOK Architecture
User-managed secrets, AES-256 at rest. Keys never exposed to the client.

Cost router:
1) Use user key if present
2) Else use managed key if Pro
3) Else block with upgrade prompt

## 5) Feature Scope (Condensed)
### Core
- HTML-native editor
- Version history
- Forking + attribution graph
- Variable density reading
- Digital garden topics

### Ingest
- RSS inbox
- YouTube transcript import
- Voice memo import

### Broadcast
- Distribution packs
- Email newsletter
- Multi-format feeds (RSS/Atom/JSON)

### Media Engine
- Audio articles (TTS)
- Generative visuals

### Discovery & Economy
- Curator leaderboard
- Contextual upvotes
- Boost marketplace

### Analytics
- Event stream (PostHog BYOK)
- Internal page views

## 6) Database Strategy (Core)
**Core identity + content**
- profiles
- posts
- post_versions
- topics
- post_topics

**Vault + assets**
- integration_keys (BYOK)
- post_distribution_packs
- storage_connections
- video_briefs

## 7) Integration Library (Heavy Hitters)
- Resend (email)
- Deepgram (STT)
- Firecrawl (scraper)
- Groq (low latency inference)
- PostHog (analytics)
- HeyGen (video avatar)
- Cloudflare R2 (storage)

