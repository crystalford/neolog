# Neolog Roadmap

**Mission:** Build the publishing platform that actually gets you readers.

Last updated: 2026-01-09

---

## Our Vision

Neolog is a **traffic-first publishing platform** where every feature answers one question: *"Will this help creators get readers?"*

We're building:
1. **Better discoverability** than Ghost (no cold-start)
2. **Better ownership** than Substack (no 10% tax, full export)
3. **Better control** than Medium (your audience, your rules)

Plus features nobody else has: **ActivityPub native publishing**, **generative visual identity**, and **one-click ePub exports**.

---

## Current Status

### ✅ Shipping Now (Production-Ready)

**Core Publishing**
- ✅ Rich HTML editor with markdown support
- ✅ Auto-save & version history
- ✅ Draft management & scheduling
- ✅ Image uploads & embeds
- ✅ Code highlighting
- ✅ SEO metadata (titles, descriptions, OG images)

**Distribution**
- ✅ RSS/Atom/JSON feeds (global + per-author)
- ✅ Email newsletters via Resend
- ✅ Cross-posting to Medium & Dev.to
- ✅ Social card generation (X, LinkedIn, Reddit)
- ✅ WebSub support (real-time RSS push)

**Discovery**
- ✅ Explore page (latest, popular, rising)
- ✅ Search (full-text + semantic via pgvector)
- ✅ Tag-based browsing
- ✅ Related posts
- ✅ Public profiles with follower counts

**Analytics**
- ✅ View tracking (total + unique)
- ✅ Scroll depth & completion rates
- ✅ Traffic sources
- ✅ Engagement metrics (comments, reactions)
- ✅ Post-specific drill-down
- ✅ Device breakdown

**Ownership**
- ✅ Full JSON export (content + metadata)
- ✅ Markdown export
- ✅ HTML archive
- ✅ Import from HTML, Markdown, RSS
- ✅ Content forking with attribution

**Monetization**
- ✅ Stripe subscriptions (keep 100%)
- ✅ Membership tiers
- ✅ One-click tips
- ✅ Subscriber management

**Developer Tools**
- ✅ API endpoints for publishing
- ✅ API key management
- ✅ Webhook ingestion
- ✅ llms.txt (AI-friendly context)
- ✅ MCP server integration

---

## 🚧 In Progress (Next 30 Days)

### Phase 1: Protocol-Native Publishing

**ActivityPub Integration**
- 🚧 Posts as native ActivityPub `Note` objects
- 🚧 Actor profiles (WebFinger, .well-known)
- 🚧 Inbox/Outbox endpoints
- 🚧 Federation with Mastodon, fediverse clients
- 🚧 Cross-post to fediverse automatically

**Why:** Your posts appear in Mastodon feeds natively, not as links. Reach 10M+ fediverse users instantly.

---

### Phase 2: Generative Visual Identity

**Shader-Based Covers**
- 🚧 Deterministic shader generation from content hash
- 🚧 Unique visual per post (change text = change visual)
- 🚧 Fast GLSL rendering
- 🚧 Social card integration
- 🚧 Customizable shader palettes

**Interactive Embeds**
- 🚧 Procedural pattern generators
- 🚧 Cellular automata (Conway's Life, etc.)
- 🚧 MIDI instruments (playable in-page)
- 🚧 WebGL scenes
- 🚧 Shader playgrounds

**Why:** No more stock photos. No AI slop. Your content creates its own aesthetic. Every post is visually distinct and memorable.

---

### Phase 3: ePub Export Engine

**One-Click Book Creation**
- 🚧 Export entire publication as ePub 3.0
- 🚧 Automatic table of contents
- 🚧 Chapter organization from series/tags
- 🚧 Embedded metadata (author, cover, ISBN)
- 🚧 Preserve images, formatting, code blocks
- 🚧 MOBI/PDF conversions (optional)

**Why:** Your blog IS a book. Publish incrementally, export anytime. No Gumroad needed.

---

## 📅 Next Quarter (Q1 2026)

### Phase 4: Advanced SEO & Traffic Tools

**SEO Analyzer**
- 📅 Real-time optimization suggestions (title, meta, headings)
- 📅 Keyword density analysis
- 📅 Readability scores
- 📅 Internal linking suggestions
- 📅 Image alt-text checker
- 📅 Competitor content gap analysis

**Traffic Dashboard**
- 📅 Traffic sources breakdown (organic, social, direct, referral)
- 📅 Google Search Console integration
- 📅 Ranking tracker for target keywords
- 📅 Optimal posting time suggestions
- 📅 Traffic prediction (based on tags, timing, length)
- 📅 Content performance benchmarks

**Why:** SEO is the #1 source of sustained traffic. Make it easy.

---

### Phase 5: Enhanced Import/Export

**Ghost Import**
- 📅 Full Ghost JSON import (posts + tags + metadata)
- 📅 Preserve publication structure
- 📅 Member/subscriber migration
- 📅 One-click switching from Ghost

**Substack Import**
- 📅 ZIP file import (posts + subscribers)
- 📅 Email list migration
- 📅 Archive preservation
- 📅 Redirect setup guide

**Medium Import**
- 📅 Bulk HTML import improvements
- 📅 Stats preservation (claps → reactions)
- 📅 Publication structure
- 📅 Canonical URL handling

**SEO Support Mode**
- 📅 "Keep Ghost/Substack, boost with Neolog" option
- 📅 Create link web for backlink juice
- 📅 Cross-syndication without duplication penalties
- 📅 Canonical URL management

**Why:** Make switching effortless. Or support existing platforms for SEO boost.

---

### Phase 6: Multi-Projection Architecture

**Source → Projections**
- 📅 Write once, project to multiple formats:
  - HTML (web, full interactivity)
  - ActivityPub Note (fediverse)
  - RSS/Atom item (feed readers)
  - ePub chapter (books)
  - JSON-LD (semantic web, AI consumption)
  - Markdown (GitHub, dev tools)

**Data Payload Exports**
- 📅 `.ics` calendar events (from post content)
- 📅 `.vcf` contact cards
- 📅 GeoJSON (location data)
- 📅 BibTeX bibliographies
- 📅 SCORM packages (e-learning)

**Why:** Content isn't just text—it's structured data. Let readers consume in any format.

---

## 🔮 Future Vision (Q2+ 2026)

### Smart Distribution

**Buffer-Style Social Scheduling**
- Queue posts across platforms (X, LinkedIn, Mastodon, Bluesky)
- Optimal timing per platform
- Auto-generated variants (thread for X, long-form for LinkedIn)
- Performance tracking per platform
- A/B testing headlines

**Traffic Amplification**
- Automatic syndication network (with permission)
- Cross-author recommendations
- SEO collaboration (guest posts, backlinks)
- Community-driven discovery boosts

### Advanced Content Features

**Interactive Documents**
- PDFs with working forms & calculated fields
- Excel sheets with macros (via WASM)
- PowerPoint with embedded logic
- Runnable code snippets (multiple languages)

**Collaborative Publishing**
- Co-author workflows
- Editorial review pipelines
- Publication teams
- Multi-author newsletters

### Federation & Portability

**AT Protocol Support**
- Publish to Bluesky natively
- DID-based identity
- Personal data servers (PDS)

**Nostr Integration**
- Publish to Nostr relays
- Crypto-native identity
- Zaps (lightning tips)

### AI-Powered Growth

**Smart Content Suggestions**
- Topic gap analysis ("write about X to reach Y audience")
- Optimal length recommendations
- Headline A/B testing
- Content refresh suggestions (update old posts)

**Audience Insights**
- Reader intent analysis
- Churn prediction
- Growth forecasts
- Competitor benchmarking

---

## What We're NOT Building

To stay focused on publishing and traffic, we're **archiving or removing**:

- ❌ **Boost campaigns & marketplace** (promotion complexity)
- ❌ **Curator scores & leaderboards** (gamification overhead)
- ❌ **Wallet & referral programs** (fintech complexity)
- ❌ **Multiple video AI providers** (niche, expensive)
- ❌ **Deepgram/Gemini ingest automations** (over-engineered)
- ❌ **Automated content sources & monitors** (too magical)

We keep: **Writing, publishing, distributing, analyzing.** Everything else is distraction.

---

## Philosophy

### 1. Traffic First
Every feature must answer: "Does this help creators get readers?"
- SEO tools ✅
- ActivityPub reach ✅
- Generative covers (memorable) ✅
- Random gamification ❌

### 2. Own Your Work
You can leave Neolog anytime with:
- All your content (ePub, JSON, Markdown)
- All your audience (RSS, email list export)
- All your data (analytics, traffic sources)

No lock-in. Ever.

### 3. Protocol Over Platform
The web has winners already: RSS, ActivityPub, ePub, HTML.
We embrace them, don't compete with them.
Neolog is a **publishing node**, not a walled garden.

### 4. Generative Identity
No stock photos. No generic templates. No AI slop.
Your content hash → deterministic shader → unique visual.
Change a word, the aesthetic shifts. Your words are your brand.

### 5. Radically Simple
Ghost is simple. Substack is simple. We're simpler.
Write → Publish → Get readers.
No "monitors," "vaults," "supply chains."
Just publishing that works.

---

## Technical Priorities

### Performance
- Sub-200ms page loads
- Instant editor saves
- Real-time analytics
- Serverless-first architecture

### Privacy
- GDPR compliant
- No tracking without consent
- Anonymous analytics option
- Right to deletion (one-click export → delete)

### Accessibility
- WCAG 2.1 AA compliant
- Keyboard navigation
- Screen reader optimized
- High contrast mode

### Open Source
- MIT license
- Self-hostable
- No proprietary lock-in
- Community-driven roadmap

---

## How to Contribute

We're focused on **publishing features** that drive **traffic and ownership**.

**High Priority Contributions:**
- ActivityPub federation improvements
- SEO analyzer enhancements
- ePub export quality
- Ghost/Substack import tools
- Shader generators for covers
- Traffic analytics insights

**We're NOT accepting:**
- New AI provider integrations (we have enough)
- Gamification features (leaderboards, badges, etc.)
- Complex automation systems
- Video/audio creation tools
- Cryptocurrency integrations

---

## Timeline

| Quarter | Focus |
|---------|-------|
| **Q1 2026** | ActivityPub, Generative Covers, ePub Export |
| **Q2 2026** | Advanced SEO, Traffic Dashboard, Import Excellence |
| **Q3 2026** | Multi-Projection, Smart Distribution, Interactive Embeds |
| **Q4 2026** | AI Growth Tools, Federation Expansion, Mobile Apps |

---

## Metrics That Matter

We measure success by:
1. **Avg. views per post** (discoverability working?)
2. **Traffic sources diversity** (not just one channel)
3. **Export rate** (people trust us with ownership)
4. **Time to first 100 readers** (cold-start solved?)
5. **Cross-platform reach** (ActivityPub, RSS adoption)

NOT by:
- Daily active users (vanity metric)
- Posts published (quality > quantity)
- Time on site (readers want to leave and share)
- Feature count (simplicity wins)

---

## Questions or Suggestions?

- **GitHub Issues:** [Report bugs or request features](https://github.com/yourusername/neolog/issues)
- **Discussions:** [Join the conversation](https://github.com/yourusername/neolog/discussions)
- **Email:** [roadmap@neolog.com](mailto:roadmap@neolog.com)

---

**Let's build the future of publishing. Together.** 🚀
