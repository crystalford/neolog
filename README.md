# Neolog

**The publishing platform that actually gets you readers.**

Neolog is a next-generation publishing platform focused on one thing: **getting your content seen**. Write once, distribute everywhere, and own your audience completely.

## Why Neolog?

### vs Ghost
- **Built-in discovery** — Your first post reaches readers immediately, no cold-start problem
- **Advanced SEO** — Real-time optimization suggestions and traffic insights
- **Lower cost** — No hosting fees, pay only for what you use

### vs Substack
- **No revenue tax** — Keep 100% of your earnings (minus payment processing)
- **You own everything** — Export your entire publication as an ePub book anytime
- **Real analytics** — Understand exactly where your traffic comes from
- **Better SEO** — Built-in optimization tools to rank higher

### vs Medium
- **Your audience is yours** — Followers and subscribers belong to you, not the platform
- **No algorithmic uncertainty** — Transparent discovery and distribution
- **Full creative control** — HTML-native editor, not just markdown
- **Portable by default** — RSS, Atom, JSON feeds, ActivityPub support

---

## Core Features

### Write & Publish
- **Rich HTML editor** with markdown support, code highlighting, embeds
- **Generative covers** — Every post gets a unique visual identity generated from its content
- **Auto-save & version history** — Never lose work
- **SEO optimizer** — Real-time suggestions to improve discoverability
- **Schedule publishing** — Queue posts for optimal timing

### Distribution That Works
- **Multi-projection architecture** — One post becomes:
  - A webpage with full interactivity
  - An ActivityPub object for the fediverse
  - RSS/Atom/JSON feed items
  - ePub chapter (one-click book export)
  - Social media posts (X, LinkedIn, Reddit)
- **Traffic dashboard** — See exactly where readers come from
- **Cross-posting** — Auto-publish to Medium and Dev.to
- **Email newsletters** — Built-in subscriber management with Resend

### Discovery & Growth
- **Explore feed** — Latest, popular, and rising content surfaced algorithmically
- **SEO-first design** — Every page optimized for search engines
- **Tag-based discovery** — Connect with readers interested in your topics
- **ActivityPub native** — Your posts appear in Mastodon, fediverse clients
- **Related posts** — Automatic content recommendations

### Own Your Work
- **Full export** — Download everything as JSON, Markdown, or ePub book
- **Portable audience** — RSS feeds mean readers can follow anywhere
- **No lock-in** — Your content, your data, your followers
- **Version history** — Every edit preserved with immutable snapshots

### Import from Anywhere
- **Ghost import** — Bring your entire publication (posts + metadata)
- **Substack import** — Content and subscriber lists
- **Medium import** — All your stories preserved
- **Bulk HTML/Markdown import** — Migrate from any platform
- **RSS ingestion** — Auto-pull from existing feeds

### Analytics That Matter
- **View tracking** — Total views and unique visitors
- **Traffic sources** — See exactly where readers come from
- **Scroll depth & completion** — Know what resonates
- **SEO performance** — Track search rankings and improvements
- **Engagement metrics** — Comments, shares, saves

### Monetization (Optional)
- **Paid subscriptions** — Stripe integration, no platform fees
- **Member tiers** — Offer different access levels
- **Tips** — One-click supporter payments
- **Keep 100%** — We don't take a cut (Stripe fees only: ~3%)

---

## What Makes Neolog Different?

### 🎨 Generative Visual Identity
Every post automatically generates a unique cover using deterministic shaders seeded by content hash. Change a word, the visual shifts. No stock photos, no design work — your content determines its own aesthetic.

### 🌐 Protocol-Native Publishing
You're not just using a website — you're running a publishing node. Posts are simultaneously:
- HTML pages (for browsers)
- ActivityPub Notes (for Mastodon, fediverse)
- RSS items (for feed readers)
- ePub chapters (for books)

Write once, publish to every protocol that matters.

### 📈 Traffic-First Architecture
Every feature asks: "Will this help you get readers?" SEO optimizer, traffic dashboard, optimal posting times, discoverable feeds — built-in, not bolted on.

### 🔓 Radical Ownership
Export your entire publication history as a properly formatted ePub book with one click. Take your RSS feeds anywhere. Your audience subscribes to YOU, not to Neolog.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS
- **Editor**: Tiptap (extensible rich text)
- **Email**: Resend
- **Payments**: Stripe
- **Storage**: Cloudflare R2 or Amazon S3 (your choice)

---

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/neolog.git
cd neolog
npm install
```

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the schema: `supabase-schema.sql` via SQL Editor
3. Apply migrations in `supabase/migrations/`
4. Enable Row Level Security (RLS policies included)

### 3. Configure Environment

Copy `.env.local.example` to `.env.local`:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Email notifications
RESEND_API_KEY=your_resend_key
EMAIL_FROM=Your Name <noreply@yourdomain.com>

# Optional: AI features (summaries, SEO suggestions)
OPENAI_API_KEY=your_openai_key

# Optional: Payments
STRIPE_SECRET_KEY=your_stripe_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_pub_key
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy

```bash
vercel
```

Or deploy to any Node.js hosting provider.

---

## Key Pages

- **`/`** — Landing page showcasing features
- **`/write`** — Rich text editor with SEO tools
- **`/explore`** — Discover trending content
- **`/[username]`** — Public author profiles
- **`/[username]/[slug]`** — Individual posts
- **`/dashboard`** — Creator dashboard
- **`/analytics`** — Traffic and engagement insights
- **`/import`** — Import from Ghost, Substack, Medium

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/posts/publish` | POST | Publish a post with full distribution |
| `/api/export` | GET | Export your entire publication |
| `/api/import` | POST | Import from other platforms |
| `/ [username]/feed` | GET | RSS/Atom/JSON feeds |
| `/api/agent/search` | GET | Semantic content search |
| `/api/analytics/track` | POST | Track views and engagement |

Full API documentation: [See ROADMAP.md](ROADMAP.md)

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for our vision and upcoming features:

- ✅ Rich HTML editor with SEO tools
- ✅ Multi-platform distribution (Medium, Dev.to)
- ✅ RSS/Atom/JSON feeds
- ✅ Version history & content forking
- 🚧 ActivityPub native publishing (fediverse integration)
- 🚧 Generative shader covers (unique visual per post)
- 🚧 ePub export (entire publication as book)
- 📅 Advanced SEO analyzer with real-time suggestions
- 📅 Traffic prediction and optimal posting times
- 📅 Interactive embeds (procedural patterns, MIDI, WebGL)

---

## Philosophy

### Traffic is Oxygen
A publishing platform that doesn't help you get readers is just a fancy text editor. Every Neolog feature is designed to either improve discoverability or help you understand your audience.

### Own Your Stack
Your content, your audience, your data. Export everything anytime. RSS feeds are first-class. No algorithmic mystery. If Neolog disappeared tomorrow, you'd lose nothing.

### Protocol Over Platform
The future of publishing isn't another walled garden. It's open protocols (RSS, ActivityPub, ePub) working together. Neolog makes you a node in the web, not a user on a site.

### Generative Identity
Stock photos are dead. AI slop is obvious. Neolog generates unique visuals deterministically from your content itself. Your words create your aesthetic.

---

## Import Your Existing Content

### From Ghost
```bash
# Export from Ghost Admin → Labs → Export
# Upload JSON file to Neolog → Import → Ghost JSON
```

### From Substack
```bash
# Settings → Export your posts (ZIP file)
# Upload to Neolog → Import → Substack
```

### From Medium
```bash
# Settings → Download your information
# Upload to Neolog → Import → Medium (HTML)
```

### Bulk Import
- Drop multiple HTML or Markdown files
- Neolog preserves metadata, images, formatting
- Review and publish when ready

---

## Community & Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/neolog/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/neolog/discussions)
- **Documentation**: [docs.neolog.com](https://docs.neolog.com) *(coming soon)*

---

## License

MIT — Use it, fork it, improve it, monetize it. Just keep publishing.

---

**Ready to get readers?** [Start publishing →](https://neolog.com)
