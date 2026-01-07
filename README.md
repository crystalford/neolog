# Neolog

<!-- Trivial change to force Vercel redeploy -->

<!-- Another trivial change to force Vercel route refresh -->

A creative infrastructure system for capture-first creators who care about ownership, distribution, and creative control.

Pipeline: **Capture → Organize → Compose → Distribute → Analyze**

## Why Neolog?

**vs Substack**: You own your identity. Export everything. No 10% tax on revenue. Real analytics.

**vs Medium**: Your followers are *yours*. No algorithmic volatility. No "Partner Program" opacity.

**vs Ghost**: Built-in discovery. Curator network. Boost marketplace. No cold-start problem.

## Features

### Capture + Vault
- **Capture-first Vault** — Save prompts, snippets, links, and notes with provenance
- **Automation/webhook ingest** — Push captures from scripts and AI systems (API key)
- **Publication-scoped organization** — Optional project containers for Vault + posts

### Publishing
- **HTML-native editor** — Full creative control, not just markdown
- **Version history** — Every save creates an immutable snapshot
- **Forking** — GitHub-style content remixing with attribution
- **Reading time** — Auto-calculated based on word count + images

### Distribution
- **RSS/Atom/JSON feeds** — Per-author and global firehose
- **WebSub support** — Real-time push notifications (not polling)
- **Subscriptions** — Users can follow with an account
- **Email subscribers** — Capture emails, send notifications
- **Personalized feed** — Posts from creators you follow

### Discovery
- **Explore page** — Browse latest, rising, and most-forked content
- **Curator leaderboard** — Reputation based on early discovery
- **Rising posts algorithm** — Surface quality before it's viral
- **Upvotes with context** — Track when upvotes happen (early = more valuable)

### Analytics
- **View tracking** — Total views, unique visitors
- **Scroll depth** — See where readers drop off
- **Read completion** — Qualified reads (75%+ scroll + 30s+ dwell)
- **Device breakdown** — Desktop, mobile, tablet
- **Post-specific drill-down** — Deep analytics per article

### Monetization
- **Boost campaigns** — Pay to promote your posts
- **Placements** — Earn by hosting promoted content
- **Referral programs** — Pay bounties for new subscribers
- **Wallet system** — Built-in balance for the creator economy

### Ownership
- **Full export** — JSON (complete), Markdown, HTML archive
- **Feed URLs** — Take your subscribers anywhere
- **No lock-in** — Your content, your audience, your data

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (Postgres + Auth + Realtime)
- **Styling**: Tailwind CSS
- **Email**: Resend
- **Deployment**: Vercel (recommended)

## Getting Started

### 1. Clone and install

```bash
git clone <your-repo>
cd neolog
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the schema in `supabase-schema.sql` via the SQL Editor
3. Run migrations in `supabase/migrations/` (e.g. `add_onboarded_at.sql`, `add_publications.sql`, `add_provider_usage.sql`, `add_usage_caps.sql`, `add_video_brief_jobs.sql`, `add_syndication.sql`, `add_og_variants.sql`)
3. Enable Row Level Security (the schema includes RLS policies)

### 3. Configure environment

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# For email notifications
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=Neolog <noreply@yourdomain.com>

# Your domain
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 4. Run locally

```bash
npm run dev
```

### 5. Deploy

```bash
vercel
```

## Directory Structure

```
src/
├── app/
│   ├── (auth)/           # Login, signup
│   ├── (dashboard)/      # Dashboard, analytics, boost, settings, subscribers
│   ├── [username]/       # Profile pages, RSS feeds
│   │   └── [slug]/       # Individual posts
│   ├── api/              # API routes (export, subscribe, publish, feeds)
│   ├── curators/         # Curator leaderboard
│   ├── explore/          # Discovery feed
│   ├── feed/             # Personalized subscription feed
│   └── write/            # Post editor
├── components/
│   ├── BoostedPost.tsx   # Promoted content display
│   ├── CuratorBadge.tsx  # Reputation indicator
│   ├── Editor.tsx        # HTML editor
│   ├── EmailSubscribeForm.tsx
│   ├── ForkButton.tsx
│   ├── Header.tsx
│   ├── PostCard.tsx
│   ├── SubscribeButton.tsx
│   └── UpvoteButton.tsx
├── hooks/
│   └── useAnalytics.ts   # Analytics tracking hook
├── lib/
│   ├── email/            # Resend integration
│   └── supabase/         # Supabase clients
└── types/
    └── database.ts       # TypeScript types
```

## Database Schema

See `supabase-schema.sql` for the complete schema including:

- `profiles` — User profiles
- `posts` — Content with forking support
- `post_versions` — Version history
- `post_stats` — View/engagement tracking
- `subscriptions` — User follows
- `email_subscribers` — Email-only subscribers
- `post_upvotes` — Upvotes with context
- `curator_scores` — Reputation tracking
- `boost_campaigns` — Promotion campaigns
- `boost_placements` — Publisher inventory
- `boost_wallets` — Creator balance
- `referral_programs` — Subscriber bounties

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/subscribe` | POST | Email subscription |
| `/api/subscribe/confirm` | GET | Confirm email |
| `/api/posts/publish` | POST | Publish + notify |
| `/api/export` | GET | Export data |
| `/api/feeds/global` | GET | Global RSS/Atom/JSON |
| `/[username]/feed` | GET | Per-author RSS/Atom/JSON |
| `/api/inbox/webhook` | POST | Headless inbox ingestion (API key) |
| `/api/automation/trigger` | POST | Automation triggers (API key) |
| `/api/cron/rss-pull` | GET | Server-side RSS pull into inbox (cron) |
| `/api/agent/user?username=...` | GET | Agent-friendly user profile + recent posts (JSON by default; supports `Accept: text/markdown` or `?format=md`) |
| `/api/agent/post?username=...&slug=...` | GET | Agent-friendly post payload (JSON by default; supports `Accept: text/markdown` or `?format=md`) |
| `/api/agent/search?q=...` | GET | Agent-friendly post search (optional `&username=...`; JSON by default; supports `Accept: text/markdown` or `?format=md`) |
| `/api/agent/vector-search?q=...` | GET | Agent-friendly semantic search (optional `&username=...`; uses pgvector + embeddings; JSON by default; supports `Accept: text/markdown` or `?format=md`) |
| `/api/agent/ingest` | POST | Ingest URL or raw text and create a draft post (API key) |
| `/api/agent/draft/update` | POST | Update a draft post by id (API key) |
| `/api/agent/draft/publish` | POST | Publish a draft post by id (API key) |
| `/api/agent/embeddings/backfill` | POST | Backfill/refresh embeddings for recent published posts (API key) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | For admin operations (required for automation/webhooks/cron and account deletion) |
| `NEXT_PUBLIC_APP_URL` | Yes | Your domain |
| `RESEND_API_KEY` | Yes | For email sending |
| `EMAIL_FROM` | No | Sender address |
| `OPENAI_API_KEY` | No | Required for AI features like `/api/agent/vector-search` embeddings |
| `OPENAI_EMBEDDING_MODEL` | No | Optional (default `text-embedding-3-small`); must be 1536-dim for current pgvector schema |
| `WEBSUB_HUB_URL` | No | WebSub hub for RSS push |
| `CRON_SECRET` | No | Secures `/api/cron/*` endpoints |

## Automation (Headless Ingestion)

Create an "Automation API key" in the dashboard settings, then call the webhook:

- `POST /api/inbox/webhook`
    - Header: `Authorization: Bearer neo_...`
    - JSON body accepts: `sourceType`, `title`, `canonicalUrl`, `sourceUrl`, `rawData`

Or use the trigger endpoint:

- `POST /api/automation/trigger`
    - `{"event":"inbox.create", ...}`
    - `{"event":"rss.pull"}`

Note: scheduled `/api/cron/*` routes can be triggered via Vercel Cron Jobs on paid plans, or via an external scheduler on Hobby.

## New Agent Endpoints (Quick Test)

All `/api/agent/*` endpoints require an Automation API key.

- Vector search:
    - Logged-in browser use: enable Semantic toggle on `/search`
    - API key use: `curl -H "x-api-key: neo_..." "http://localhost:3000/api/agent/vector-search?q=what+is+neolog&limit=5"`
    - Optional: `&username=yourname` (filters to that author)
- Ingest to draft:
    - `curl -X POST -H "x-api-key: neo_..." -H "content-type: application/json" -d "{\"url\":\"https://example.com\",\"title\":\"Example\"}" "http://localhost:3000/api/agent/ingest"`

- Backfill embeddings (recommended before heavy semantic search):
    - `curl -X POST -H "x-api-key: neo_..." "http://localhost:3000/api/agent/embeddings/backfill?limit=200&maxUpserts=25"`

## Vector Search Setup

- Apply the migration in Supabase: [supabase/migrations/add_vector_search.sql](supabase/migrations/add_vector_search.sql)
- Ensure `OPENAI_API_KEY` is set in your environment.

Embeddings are refreshed automatically when you publish a post (via the normal publish flow or `/api/agent/draft/publish`). Use the backfill endpoint/script to populate older posts.

## MCP Server

Run an MCP server over stdio that exposes Neolog tools (`neolog_search`, `neolog_vector_search`, `neolog_ingest_draft`):

- `NEOLOG_API_KEY=neo_... NEOLOG_BASE_URL=http://localhost:3000 npm run mcp`

## Roadmap

- [ ] Rich text editor (TipTap)
- [ ] Image uploads (Supabase Storage)
- [ ] Stripe integration (paid subscriptions)
- [ ] ActivityPub federation
- [ ] AT Protocol identity (DIDs)
- [ ] Weekly digest emails
- [ ] Mobile app

## Admin Utilities

Delete a test account (and cascade-delete its content) using a service role key:

- `npm run delete:user -- <username> --yes`

Backfill embeddings for semantic search (requires an Automation API key + `OPENAI_API_KEY` and the pgvector migration):

- `NEOLOG_API_KEY=neo_... NEOLOG_BASE_URL=http://localhost:3000 npm run embeddings:backfill -- --limit=200 --maxUpserts=25`

## License

MIT
