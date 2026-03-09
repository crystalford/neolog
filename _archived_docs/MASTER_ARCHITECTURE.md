# Neolog Master Architecture

Version: 3.2 (Supply Chain Definition)  
Last updated: January 2026  
Core philosophy: "Not a place to write. An intellectual supply chain."

## 1) Product Vision
Neolog is a headless intelligence log: a system that turns raw inputs into structured IP and ships it to distribution channels.

What it is:
- A supply chain for intellectual output.
- The database of record for a creator's public IP.

What it is not:
- A social network.
- A generic website builder.
- A private note app.

### Signal Flow (Supply Chain)
**Ingest (Loading Dock)**  
Turn chaos into normalized JSON: scrapers, feeds, audio, webhooks.

**Core (Factory Floor)**  
Refine raw input into structured content: editor, version log, knowledge graph.

**Broadcast (Shipping Dept)**  
Package and distribute to the marketplace: email, threads, RSS, media outputs.

## 2) System Principles
- Standardize inputs into a single JSON schema.
- Separate authoring from distribution.
- Preserve ownership (canonical URLs, backups).
- Prefer BYOK for cost-heavy features.

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

## 5) Functional Specification (By Station)

### Station 1: Ingest (Loading Dock)
- Firecrawl: Reaction Draft. URL -> Firecrawl -> Markdown -> Draft.
- Deepgram: Commute Capture. Audio -> Deepgram -> Transcript -> LLM cleanup -> Draft.
- Reddit: Context Import. Thread URL -> top comments -> Draft sidebar.
- GitHub: DevLog. Webhook -> markdown fetch -> update post.
- RSS/Atom: News Desk. Feed -> parser -> triage queue -> user selects -> draft.
- Gemini 1.5: Video Reader. YouTube URL -> summary -> draft.

### Station 2: Core (Factory Floor)
- Supabase: Sovereign Storage. Content, users, relationship graph.
- ProseMirror: Variable Density Editor. Blocks tagged as summary/detail/private.
- OpenAI: Expansion/Compression on selected text (BYOK).
- Anthropic: Critique partner. Draft -> feedback notes (BYOK).
- Groq: Real-time autocomplete (low latency).
- Perplexity: Fact checking + citations (BYOK).

### Station 3: Broadcast (Shipping Dept)
- Resend: Newsletter dispatch. Post HTML -> email template -> send.
- X: Threader. Post -> splitter -> thread.
- LinkedIn: Business format. Post -> formatter -> LinkedIn API.
- Medium: Canonical syndication. Post HTML -> Medium -> rel=canonical.
- Instagram: Quote card. Title -> image -> post.
- TikTok: Avatar read. Summary -> HeyGen -> MP4 -> post.
- Spotify: Audio article. Post -> TTS -> RSS update.
- GitHub: Hard backup. Post -> markdown commit.

## 6) Feature Scope (Condensed)
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

## 7) Database Strategy (Core)
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

## 8) Integration Library (Heavy Hitters)
- Resend (email)
- Deepgram (STT)
- Firecrawl (scraper)
- Groq (low latency inference)
- PostHog (analytics)
- HeyGen (video avatar)
- Cloudflare R2 (storage)
