# NEOLOG DASHBOARD & HOMEPAGE REDESIGN
## Conceptual Architecture Specification

*Principal Product Engineer / UX Systems Architect Brief*

---

## EXECUTIVE SUMMARY

### The Core Problem
The current dashboard exposes **24 navigation destinations** for what is fundamentally a **single-activity product**: writing blog posts with captured reference material. This creates:

1. **Cognitive overload** — Users can't build a mental model of where things live
2. **Feature fragmentation** — Related functions scattered across unrelated routes
3. **Loss of purpose** — The product's value proposition ("make AI-assisted creation coherent over time") is invisible in the UI
4. **Homepage disconnect** — Marketing language doesn't prepare users for dashboard complexity

### The Redesign Thesis
**Neolog is not a tool. It's a workspace for language exploration.**

Everything you capture, everything you draft, everything you publish—it should feel like **one continuous creative session** that persists across time. The dashboard should make that continuity visible.

### Guiding Principle
> **Show the work, not the system.**
> 
> Users don't think in terms of "posts", "inbox artifacts", "vault assets", "syndications", and "monitors". They think: "I had an idea last week. Where did it go? Can I turn it into something?"

### Unit of Continuity
> **Neolog persists work-in-progress meaning, not just finished outputs.**

This is why:
- Captures never disappear unless explicitly deleted
- Drafts are foregrounded over published work
- "Today's Focus" exists as the default landing state
- Features unlock based on demonstrated use, not elapsed time

### Core Progression Principle
> **There is no canonical path through Neolog. Progression is branching, not laddered.**

Users discover capabilities through their own workflows, not through a prescribed funnel.

---

## PHASE 1: USER MENTAL MODEL

### How Users Actually Think About Creative Work

#### 1.1 The Natural Flow
Users don't arrive at Neolog thinking "I need to manage my posts table." They arrive with one of these mental states:

| Mental State | What They're Actually Thinking |
|--------------|-------------------------------|
| **Capture** | "I just found/thought of something. Don't let me lose it." |
| **Explore** | "What have I been collecting? What patterns do I see?" |
| **Create** | "I want to turn something into a real piece." |
| **Review** | "How did my recent work perform? What resonated?" |
| **Find** | "I know I saved something about X. Where is it?" |

#### 1.2 The Persistence Model
Users need to understand two things about their work:
1. **Everything is saved** — Nothing disappears unless explicitly deleted
2. **Everything has a lifecycle** — Raw → Refined → Published → Archived

The current system makes neither of these obvious.

#### 1.3 The "One Creative Session" Metaphor
The mental model we want to establish:

> "Neolog remembers everything I've captured and worked on. When I return, I pick up where I left off. My scattered thoughts from last Tuesday connect to my finished essay from last month. It's all one ongoing conversation with my own ideas."

### What This Means for Design

**Show temporal continuity** — "You were working on X yesterday. Here's where you left off."

**Show conceptual continuity** — "These 5 captures share a theme. They could become something."

**De-emphasize data management** — The dashboard is not a database admin panel. It's a creative workspace.

---

## PHASE 2: CORE USER OBJECTS

### 2.1 Object Hierarchy

The product should expose **3 primary objects** that users understand intuitively:

```
┌─────────────────────────────────────────────────────────────┐
│  CAPTURE                                                     │
│  ─────────                                                   │
│  Anything you saved. Links, quotes, screenshots, prompts,    │
│  fragments, ideas. The raw material.                         │
│                                                              │
│  Lifecycle: Captured → (optionally) Promoted to Draft        │
│  Lives in: Inbox (recent) → Vault (organized)                │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  DRAFT                                                       │
│  ──────                                                      │
│  Anything you're actively writing. Started from scratch or   │
│  promoted from capture. Work in progress.                    │
│                                                              │
│  Lifecycle: Draft → Scheduled → Published → (optionally)     │
│             Archived                                         │
│  Lives in: Workspace                                         │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PUBLISHED                                                   │
│  ──────────                                                  │
│  Finished work that's live. Has a public URL. Collecting     │
│  views, reactions, comments.                                 │
│                                                              │
│  Lifecycle: Published → (optionally) Updated → (optionally)  │
│             Archived                                         │
│  Lives in: Your Profile (public) + Dashboard (private view)  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Secondary Objects (Progressive Disclosure)

These exist but should be **hidden until needed**:

| Object | Purpose | When to Surface |
|--------|---------|-----------------|
| **Stack** | A named collection of related published posts | After 2+ posts exist |
| **Publication** | A branded container/project | After user has multiple projects |
| **Monitor** | Automated capture from sources | Power users who want RSS ingest |
| **Source** | A feed/URL being tracked | When monitors are enabled |
| **Subscriber** | Someone following your work | After first subscriber |
| **Analytics** | Performance metrics | After first publish |

### 2.3 Object Relationships

```
User
 ├── Captures (many)
 │    ├── belongs to: Inbox or Vault
 │    ├── can become: Draft
 │    └── tagged with: Topics
 │
 ├── Drafts (many)
 │    ├── may reference: Captures
 │    ├── belongs to: Publication (optional)
 │    └── can become: Published Post
 │
 ├── Published Posts (many)
 │    ├── belongs to: Publication (optional)
 │    ├── part of: Stack (optional)
 │    ├── has: Analytics
 │    └── has: Comments, Reactions
 │
 ├── Publications (few)
 │    ├── contains: Drafts, Published Posts
 │    └── has: Subscribers, Settings
 │
 └── Stacks (few)
      └── contains: Published Posts (ordered)
```

---

## PHASE 3: DASHBOARD INFORMATION ARCHITECTURE

### 3.1 Navigation Redesign

**Current State: 24 destinations across 4 sections**
```
Create: Write, Vault, Posts, Import, Topics, Series, Publications
Audience: Subscribers, Lists, Notifications, Saved
Distribution: Monitors, Analytics, Syndication, Sources, Inbox, Referrals, Boost
Workspace: Feed, History
+ Settings
```

**Proposed State: 5 primary destinations**

```
┌─────────────────────────────────────────────────────────────┐
│  NEOLOG DASHBOARD                                            │
│                                                              │
│  [Home]  [Captures]  [Workspace]  [Published]  [Settings]   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

| Destination | Contains | Replaces |
|-------------|----------|----------|
| **Home** | Activity feed, quick actions, today's focus, recent work | Dashboard, Feed |
| **Captures** | Inbox + Vault unified view, Sources config | Inbox, Vault, Sources, Import |
| **Workspace** | All drafts, active projects, stacks | Write, Posts (drafts), Series, Topics |
| **Published** | All live posts, analytics, subscribers | Posts (published), Analytics, Subscribers, Syndication |
| **Settings** | Account, publications, integrations | Settings, Publications, Referrals, Boost, Monitors |

### 3.2 Progressive Disclosure

The navigation should **grow** as users engage:

```
NEW USER (0 posts):
  [Home]  [Captures]  [Write]  [Settings]

ACTIVE USER (1-5 posts):
  [Home]  [Captures]  [Workspace]  [Published]  [Settings]

POWER USER (publications, subscribers, stacks):
  [Home]  [Captures]  [Workspace]  [Published]  [Settings]
                                                    └── Publications
                                                    └── Integrations
                                                    └── Subscribers
```

### 3.3 Capability Maturation Model

Features are surfaced based on **demonstrated user behavior**, not onboarding steps or time elapsed.

**Rules:**
- Unlocks are contextual and **reversible** (features can re-hide if unused for 30+ days)
- Unlocks never introduce more than **one new conceptual object** at a time
- **Unlocking expands what the user can do; it does not reward them for doing the "right" thing**

| Behavior Observed | Capability Surfaced |
|-------------------|--------------------|
| 3+ manual captures | Vault organization tools |
| 2 drafts referencing captures | Theme detection |
| 1 publish | Lightweight analytics |
| 3 publishes | Stacks |
| Repeated external captures | Sources / monitors |
| Consistent publishing cadence | Scheduling |
| First subscriber | Audience panel |
| 5+ posts OR first publication | Publications management |

### 3.4 Discoverability Without Navigation

> **Any hidden capability must be discoverable through context menus, inline suggestions, or system prompts—even if it is not present in global navigation.**

This prevents the "I didn't know this existed" failure mode. Examples:
- "You've captured 3 items about X. Create a stack?" (inline suggestion)
- Right-click capture → "Start draft from this" (context menu)
- Empty state → "Add a source to auto-capture" (system prompt)

### 3.5 Landing Experience by Lifecycle Stage

| Stage | Home Shows | Primary CTA |
|-------|-----------|-------------|
| **Fresh signup** | Empty state with guided path | "Capture your first idea" |
| **Has captures, no drafts** | Captures inbox + prompt | "Turn a capture into a draft" |
| **Has drafts, nothing published** | Draft queue + focus draft | "Finish and publish" |
| **Published user** | Recent activity, draft focus, performance | "Keep creating" or "See what's working" |
| **Returning after gap** | "Welcome back" summary, last draft | "Pick up where you left off" |

---

## PHASE 4: DASHBOARD SCREENS & WORKFLOWS

### 4.1 HOME (Dashboard Landing)

**Purpose:** Show what matters today. Surface continuity.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Welcome back, {name}                           [⌘K Search] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TODAY'S FOCUS                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Continue: "Why Documentation Matters"                   ││
│  │ Draft · 1,247 words · Last edited 2 hours ago          ││
│  │ [Continue Writing]                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │ QUICK ACTIONS        │  │ RECENT CAPTURES              │ │
│  │                      │  │                              │ │
│  │ [✎ New Draft]        │  │ • "Ship fast, fix later..."  │ │
│  │ [+ Capture]          │  │   Link · 3 hours ago         │ │
│  │ [⬆ Publish]          │  │                              │ │
│  └──────────────────────┘  │ • Screenshot from Twitter    │ │
│                            │   Image · Yesterday          │ │
│  ┌──────────────────────┐  │                              │ │
│  │ THIS WEEK            │  │ [See all captures →]         │ │
│  │                      │  └──────────────────────────────┘ │
│  │ ■■■■□ 4/5 posts      │                                   │
│  │ ●●●○○ 3 drafts       │  ┌──────────────────────────────┐ │
│  │ ◆◆◆◆◆ 12 captures    │  │ RECENT PUBLISHED             │ │
│  │                      │  │                              │ │
│  │ 847 views this week  │  │ "The Art of Revision"        │ │
│  └──────────────────────┘  │ 234 views · 12 reactions     │ │
│                            │                              │ │
│                            │ [See all published →]        │ │
│                            └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Behaviors:**
- "Today's Focus" is always the most recently edited draft
- If no drafts, shows capture-to-draft prompt
- If nothing captured, shows capture prompt
- This Week stats only appear after first publish, are **visually secondary**, and **dismissible**
- Recent panels are dismissible for focused creators
- **Analytics widgets never visually outweigh the current draft focus**

### 4.2 CAPTURES

**Purpose:** Everything you've saved. The raw material library.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Captures                                        [+ Add New] │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐                                            │
│  │ [All] [Inbox] [Vault] [Sources]                          │
│  └──────────────┘                                            │
│                                                              │
│  Search captures...                   [Type ▾] [Topic ▾]    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ □ "Ship fast, fix later is bad advice"                  ││
│  │   Link from twitter.com · 3 hours ago · #writing        ││
│  │   [→ Start Draft]  [⊕ Add to Stack]                     ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ □ Screenshot: "The pyramid of abstraction"              ││
│  │   Image · Yesterday · #programming                       ││
│  │   [→ Start Draft]  [⊕ Add to Stack]                     ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ □ Prompt: "Explain X as if to a 5-year-old..."         ││
│  │   Prompt from Claude · 2 days ago · #prompts            ││
│  │   [→ Start Draft]  [Copy]                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ⚡ THEME DETECTED                                        ││
│  │ 4 recent captures about "writing process"               ││
│  │ [Create Stack from these →]                             ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Tab Definitions:**
- **All**: Every capture, reverse chronological
- **Inbox**: Unprocessed captures (not yet tagged or used)
- **Vault**: Processed/organized captures
- **Sources**: Configure RSS feeds, monitors (collapsed by default)

**Key Behaviors:**
- Multi-select for bulk actions (delete, tag, move to vault)
- "Start Draft" creates a new draft with this capture as reference
- Theme detection uses embeddings to surface patterns
- Sources tab only visible after first source added

### 4.3 WORKSPACE

**Purpose:** Active writing projects. Where creation happens.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Workspace                                     [+ New Draft] │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐                                            │
│  │ [Drafts] [Scheduled] [Stacks] [Topics]                   │
│  └──────────────┘                                            │
│                                                              │
│  Search drafts...                                            │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ACTIVE DRAFTS (3)                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Why Documentation Matters                               ││
│  │ 1,247 words · Updated 2 hours ago                       ││
│  │ ■■■■■■■■□□ ~80% complete                                ││
│  │ [Continue →]                                            ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ The Case for Slow Software                              ││
│  │ 432 words · Updated yesterday                           ││
│  │ ■■■□□□□□□□ ~30% complete                                ││
│  │ [Continue →]                                            ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ Untitled Draft                                          ││
│  │ 87 words · Updated 3 days ago                           ││
│  │ ■□□□□□□□□□ Just started                                 ││
│  │ [Continue →]                                            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  SCHEDULED (1)                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🗓 Recurring Output #12                                  ││
│  │ Publishes tomorrow at 9:00 AM                           ││
│  │ [Edit] [Reschedule]                                     ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Tab Definitions:**
- **Drafts**: All work-in-progress posts
- **Scheduled**: Posts queued for future publish
- **Stacks**: Named collections (series) for organizing published work
- **Topics**: Tag management (collapsed by default)

**Key Behaviors:**
- Draft cards show word count progress heuristic (not exact, encouraging)
- "Continue →" is the primary action everywhere
- Stacks tab only visible after 3+ published posts
- Topics tab moves to Settings if unused for 30 days

### 4.4 PUBLISHED

**Purpose:** Your public work + performance.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Published                                                   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐                                            │
│  │ [Posts] [Analytics] [Engagement]                         │
│  └──────────────┘                                            │
│                                                              │
│  RECENT ACTIVITY (dismissible)                               │
│  ┌────────────────────────────────────────┐                  │
│  │ 1,247 views  ▲12%    23 new followers  │                  │
│  │ 47 reactions         3 shares          │                  │
│  └────────────────────────────────────────┘                  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  RECENT POSTS                                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ The Art of Revision                                     ││
│  │ Published 3 days ago · 234 views · 12 reactions         ││
│  │ Part of: "Writing Process" stack                        ││
│  │ [View] [Edit] [Analytics]                               ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ Ship Daily, Ship Small                                  ││
│  │ Published last week · 892 views · 34 reactions          ││
│  │ ↗ High-performing output                                ││
│  │ [View] [Edit] [Analytics]                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  [Load older posts...]                                       │
└─────────────────────────────────────────────────────────────┘
```

**Tab Definitions:**
- **Posts**: All published work with performance summary
- **Analytics**: Deep dive into metrics (views, sources, geography)
- **Engagement**: Subscribers, lists, interactions (only if >10 subscribers)

**Key Behaviors:**
- Performance hints ("high-performing", "gaining traction") are **visually secondary and dismissible**
- Stack membership shown inline
- Edit opens editor, View opens public page
- Engagement tab hidden until subscriber threshold
- **Analytics should never visually outweigh unfinished work**

### 4.5 SETTINGS

**Purpose:** Configuration. Stays out of the way.

**Sections:**
```
ACCOUNT
├── Profile (name, bio, avatar, username)
├── Email & notifications
├── Password & security
└── Connected accounts (social logins)

PUBLICATIONS
├── Create / manage publications
├── Custom domains
└── Branding (colors, logo)

INTEGRATIONS
├── Sources (RSS/monitors)
├── Syndication (X, LinkedIn, etc.)
├── API keys
└── Webhooks

BILLING (if applicable)
├── Plan
├── Payment methods
└── Invoices
```

**Key Behaviors:**
- Publications section only appears after user creates first publication OR has 5+ posts
- Integrations collapsed by default
- Most users never need to visit Settings after onboarding

---

## PHASE 5: HOMEPAGE ALIGNMENT

### 5.1 The Problem with Current Homepage

The homepage says "Capture → Vault → Publish" but the dashboard exposes 24 different concepts. There's no bridge.

### 5.2 Redesigned Homepage Structure

The homepage should preview exactly what the dashboard delivers:

```
HERO
────────────────────────────────────────────────────────
"One workspace for everything you write."

Your ideas. Your drafts. Your published work.
All in one place. Pick up where you left off.

[Start Writing — Free]
────────────────────────────────────────────────────────

THE THREE MODES
────────────────────────────────────────────────────────
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  CAPTURE    │  │  CREATE     │  │  PUBLISH    │
│             │  │             │  │             │
│  Save any-  │  │  Turn raw   │  │  One click  │
│  thing in   │  │  material   │  │  to live.   │
│  seconds.   │  │  into       │  │  Track how  │
│             │  │  drafts.    │  │  it lands.  │
│  Links,     │  │             │  │             │
│  quotes,    │  │  Reference  │  │  Analytics, │
│  ideas.     │  │  captures   │  │  reactions, │
│             │  │  as you     │  │  subs.      │
│             │  │  write.     │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
────────────────────────────────────────────────────────

THE CONTINUITY PROMISE
────────────────────────────────────────────────────────
"Neolog remembers."

Every idea you capture connects to everything else.
Return tomorrow and pick up exactly where you left off.
Your scattered thoughts become finished work.

[Visual: Timeline showing Capture → Draft → Publish evolution]
────────────────────────────────────────────────────────

SOCIAL PROOF
────────────────────────────────────────────────────────
Featured writers / Recent public posts / Stats
────────────────────────────────────────────────────────

FINAL CTA
────────────────────────────────────────────────────────
"Your ideas deserve a home."

[Start Writing — Free]
────────────────────────────────────────────────────────
```

### 5.3 Logged-In Homepage Behavior

When a logged-in user visits `/`:

**Option A: Redirect to Dashboard**
Simple, direct. User lands on `/dashboard` (Home tab).

**Option B: Personalized Homepage**
Show public feed + personal shortcut bar:
```
[Your Dashboard →]  [Continue Draft: "Doc Title"]  [+ Capture]

───────────────────────────────────────────────────────
EXPLORE NEOLOG
[Public feed of posts from other creators]
```

**Recommendation:** Start with Option A (redirect). Less complexity.

---

## PHASE 6: STATE, FEEDBACK & PROGRESS

### 6.1 Communicating Momentum

Users should always know:
1. **What they've done** — Capture count, draft count, publish count
2. **Where they are** — Current focus, last activity
3. **What's next** — Suggested action (not prescribed)

**This Week Widget (dismissible, visually secondary):**
```
THIS WEEK
■■■■□ 4 outputs published
●●●○○ 3 drafts in progress  
◆◆◆◆◆ 12 ideas captured
```

*Note: No goals, no streaks, no "momentum scores." The widget is informational, not motivational.*

### 6.2 Saved vs. Transient State

| State | Behavior | UI Treatment |
|-------|----------|--------------|
| **Saved** | Every capture, draft, post auto-saves | Show "Saved" indicator briefly on change |
| **Draft** | Unsaved editor changes | Show "Saving..." then "Saved" |
| **Undo-able** | Deleted items go to trash for 30 days | "Undo" toast with recovery link |
| **Transient** | Search queries, filter states | Cleared on navigation |

### 6.3 Progress Indicators

**Draft Progress (heuristic, not exact):**
```
< 100 words:  ■□□□□□□□□□ Just started
100-300:      ■■□□□□□□□□ Getting going  
300-600:      ■■■■□□□□□□ Taking shape
600-1000:     ■■■■■■□□□□ Solid draft
1000-1500:    ■■■■■■■■□□ Nearly there
1500+:        ■■■■■■■■■■ Ready to publish?
```

**Capture → Draft → Publish Pipeline:**
```
Today: ◇ Captured → ◆ Drafted → ● Published
       [3 items]    [1 item]     [0 items]
```

---

## PHASE 7: BOUNDARIES & NON-GOALS

### 7.1 What the Dashboard Cannot Do

| Capability | Status | Reason |
|------------|--------|--------|
| Real-time collaboration | No | Single-author tool |
| Version history UI | No | Complexity; auto-save is enough |
| Custom CSS for posts | No | Consistency; brand settings only |
| Post scheduling queue | Yes, minimal | Max 10 scheduled at a time |
| Bulk publishing | No | Quality over quantity |
| AI writing integration | Future | Not MVP scope |

### 7.2 What the Homepage Cannot Promise

| Promise | Allowed? | Reason |
|---------|----------|--------|
| "All-in-one" | Carefully | We consolidate, but we're not Notion |
| "AI-powered" | No | Core value is human authorship |
| "Social network" | No | Distribution yes, social no |
| "Make money creating" | No | Not a monetization platform (yet) |

### 7.3 Anti-Social-Gravity Rule

> **There is no infinite feed, ranking algorithm, or engagement loop inside the dashboard.**

The dashboard is a workspace, not a consumption surface. This means:
- No algorithmic "For You" feed
- No notification counts that encourage checking
- No leaderboards or comparative metrics
- No gamified streaks or badges

### 7.4 When to Say No

- Feature requests that require more than 2 nav destinations
- Integrations that don't connect to Capture → Create → Publish
- Analytics that aren't directly actionable
- Customization that fragments the experience
- Any feature that makes the dashboard feel like a feed
- Unlock mechanics that feel like rewards rather than agency expansion

---

## FINAL OUTPUT: IMPLEMENTATION SPEC

### A. Routing Structure

```
/                           → Public homepage (redirect to /dashboard if logged in)
/login                      → Auth
/signup                     → Auth
/onboarding                 → Post-signup flow

/dashboard                  → Dashboard Home (activity, focus, quick actions)
/dashboard/captures         → Captures view (inbox + vault + sources)
/dashboard/workspace        → Workspace (drafts, scheduled, stacks)
/dashboard/published        → Published (posts, analytics, audience)
/dashboard/settings         → Settings (account, publications, integrations)

/write                      → Editor (alias for /dashboard/workspace?new=true)
/write/[id]                 → Edit specific draft/post

/[username]                 → Public profile
/[username]/[slug]          → Public post
/[username]/stack/[slug]    → Public stack page
```

### B. Component Breakdown

**Dashboard Shell:**
- `DashboardLayout` — 5-tab navigation, command palette, global search
- `DashboardNav` — Top nav with progressive disclosure
- `QuickCaptureModal` — ⌘K global capture
- `CommandPalette` — ⌘/ navigation

**Home Tab:**
- `TodayFocus` — Current draft focus card
- `QuickActions` — New draft, capture, publish buttons
- `ThisWeekStats` — Activity summary widget
- `RecentCaptures` — Mini-list of latest captures
- `RecentPublished` — Mini-list with performance hints

**Captures Tab:**
- `CapturesView` — Unified inbox/vault with tabs
- `CaptureCard` — Individual capture item
- `ThemeDetector` — AI-powered pattern surfacing
- `SourcesPanel` — RSS/monitor configuration

**Workspace Tab:**
- `DraftsList` — All drafts with progress indicators
- `ScheduledList` — Queued posts
- `StacksManager` — Stack CRUD
- `TopicsPanel` — Tag management

**Published Tab:**
- `PublishedList` — Posts with performance hints (visually secondary)
- `AnalyticsDashboard` — Deep metrics view
- `EngagementPanel` — Subscribers/interactions (gated)

**Editor:**
- `Editor` — Rich text editor (existing)
- `CaptureReference` — Sidebar showing related captures
- `PublishDialog` — Publish settings modal

### C. Empty, Active & Power-User States

**Empty States:**
| View | Empty Message | CTA |
|------|--------------|-----|
| Captures | "Nothing captured yet. Ideas are everywhere." | "Install browser extension" or "Capture your first idea" |
| Workspace | "No drafts yet. Turn a capture into something." | "Start from a capture" or "Blank draft" |
| Published | "Nothing published yet. Your first post awaits." | "Finish a draft" or "Start writing" |

**Active States (standard user):**
- Shows relevant content
- Quick actions always visible
- Stats widgets populated

**Power-User States:**
- Publications switcher appears (after first publication)
- Sources/monitors configuration visible
- Engagement tab unlocked (after 10 subscribers)
- API keys section in settings

### D. Permission Boundaries

| Resource | Own | Others' | Admin |
|----------|-----|---------|-------|
| Captures | Full CRUD | N/A | N/A |
| Drafts | Full CRUD | N/A | Read |
| Published Posts | Full CRUD | Read | Read + moderate |
| Publications | Full CRUD | Subscribe | Full CRUD |
| Subscribers | Read | N/A | Read |
| Analytics | Read | N/A | Read |
| Comments | Moderate | Create | Full CRUD |

---

## NEXT STEPS

### Immediate (This PR)
1. [ ] Review this spec with stakeholders
2. [ ] Identify any conceptual gaps or concerns
3. [ ] Prioritize which sections to implement first

### Phase 1 Implementation
1. [ ] Consolidate nav from 24 → 5 destinations
2. [ ] Build new Dashboard Home tab
3. [ ] Merge Inbox + Vault into Captures view
4. [ ] Create Workspace view from existing Posts/Series

### Phase 2 Implementation
1. [ ] Build "Today's Focus" component
2. [ ] Add progress indicators to drafts
3. [ ] Implement theme detection for captures
4. [ ] Progressive disclosure logic for power features

### Phase 3 Implementation
1. [ ] Homepage redesign to match new model
2. [ ] Empty state designs
3. [ ] Activity/momentum widgets
4. [ ] Polish and accessibility pass

---

*Document Version: 1.0*
*Created: Architecture redesign session*
*Status: Ready for review*
