# NEOLOG.AI // UI Specification v3.1
## Complete Interface Design & Component Specifications

Date: 2026-01-05

Important (alignment note)
- This document is a **reference UI spec**.
- It is **not** a directive to rewrite the app or delete/replace existing functionality.
- Use it to guide incremental UX refinements and to translate “missing” areas into roadmap items.

---

## 1. GLOBAL UI FRAMEWORK

### Layout System

**Shell Structure:**
```
┌─────────────────────────────────────────────────────────┐
│ Top Bar (Fixed)                                         │
├─────────┬───────────────────────────────────────────────┤
│         │                                               │
│ Side    │                                               │
│ Nav     │          Main Content Area                    │
│ (Fixed) │                                               │
│         │                                               │
│         │                                               │
└─────────┴───────────────────────────────────────────────┘

Dimensions:
- Top Bar: Full width × 64px
- Side Nav: 240px × full height
- Main Content: Remaining space (min 800px)
- Max content width: 1600px (centered)
```

### Top Bar

```
┌─────────────────────────────────────────────────────────┐
│ [Logo] [Quick Capture ⌘K]        [@user] [Settings] [?] │
└─────────────────────────────────────────────────────────┘

Components:
├─ Logo (left): Neolog wordmark, links to /dashboard
├─ Quick Capture (center-left): Button opens capture modal
├─ User Menu (right): Avatar + username, dropdown
├─ Settings Icon (right): Links to /settings
└─ Help Icon (right): Dropdown with docs, keyboard shortcuts

Styling:
├─ Background: zinc-950
├─ Border bottom: 1px zinc-800
├─ Height: 64px
└─ Padding: 0 24px
```

### Side Navigation

```
┌──────────────────────┐
│ Dashboard            │
│                      │
│ PUBLICATIONS         │
│ > CANOPTICON      •  │
│ > Personal Blog      │
│ > Neolog             │
│ + New Publication    │
│                      │
│ VAULT                │
│ > All Assets         │
│ > Global Search      │
│                      │
│ SETTINGS             │
│ > Profile            │
│ > Platforms          │
│ > API                │
└──────────────────────┘

Components:
├─ Dashboard link (top)
├─ Publications section
│  ├─ Collapsible list
│  ├─ Active indicator (•) for publications with new items
│  └─ New publication button
├─ Vault section
├─ Settings section
└─ Collapse/expand handle (bottom)

Styling:
├─ Background: zinc-900
├─ Border right: 1px zinc-800
├─ Width: 240px (collapsed: 64px)
├─ Padding: 16px
├─ Active item: zinc-800 background, blue-500 left border
└─ Hover: zinc-800 background

Interaction:
├─ Click publication → /publications/[id]
├─ Hover shows submenu (Vault, Monitored, Posts, Analytics)
└─ Drag handle to resize width (200-320px)
```

---

## 2. DASHBOARD VIEW

### Main Dashboard (Landing Page)

```
┌─────────────────────────────────────────────────────────┐
│ Good morning, Chris                    [View All Posts] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ MONITOR UPDATES                           [Review All]   │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 14 new items across 3 publications                 │  │
│ │                                                     │  │
│ │ CANOPTICON (8)                                     │  │
│ │ Personal Blog (3)                                  │  │
│ │ Neolog (3)                                         │  │
│ │                                                     │  │
│ │ Est. review time: 8 minutes                        │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ YOUR PUBLICATIONS                                        │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ │ 📺       │ │ 📝       │ │ 🔧       │                 │
│ │CANOPTICON│ │ Personal │ │ Neolog   │                 │
│ │          │ │ Blog     │ │          │                 │
│ │490 assets│ │230 assets│ │180 assets│                 │
│ │5 new     │ │2 new     │ │3 new     │                 │
│ │Active    │ │Maint.    │ │Active    │                 │
│ └──────────┘ └──────────┘ └──────────┘                 │
│                                                           │
│ RECENT ACTIVITY                                          │
│ ┌───────────────────────────────────────────────────┐  │
│ │ • Captured "Housing Stats" from CBC    2 hrs ago   │  │
│ │ • Published "Poilievre Analysis" to X  5 hrs ago   │  │
│ │ • Promoted 3 items to CANOPTICON       8 hrs ago   │  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Layout:
├─ Greeting (top): Personalized, time-aware
├─ Monitor Updates Card: Prominent, actionable
│  └─ Click → /dashboard/monitored
├─ Publications Grid: 3-column on desktop, 1-col mobile
│  └─ Click card → /publications/[id]
└─ Recent Activity: Chronological feed of last 10 actions

Styling:
├─ Cards: zinc-900 background, zinc-800 border, 16px padding
├─ Spacing: 24px between sections
└─ Typography: Headers (18px semibold), body (14px)
```

---

## 3. MONITOR DASHBOARD

### Unified Monitor Review Interface

```
┌─────────────────────────────────────────────────────────┐
│ Monitor Dashboard                  [Settings] [Refresh] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ Filters: [All Publications ▾] [All Types ▾] [All ▾]    │
│                                                           │
│ 14 items to review · Est. time: 8 minutes                │
│ [Promote Selected (0)] [Dismiss All]                     │
│                                                           │
│ CANOPTICON (8 items)                        [Expand All]│
│ ┌───────────────────────────────────────────────────┐  │
│ │ ☐ 🎥 Poilievre announces housing plan              │  │
│ │    YouTube · 12:34 · 15K views · 3 hours ago       │  │
│ │    "My plan to fix housing..."                      │  │
│ │    [⭐ Promote] [👁 Read] [✕ Dismiss]              │  │
│ └───────────────────────────────────────────────────┘  │
│ ┌───────────────────────────────────────────────────┐  │
│ │ ☐ 📰 Housing starts drop 20%                       │  │
│ │    CBC News · 890 words · 2 hours ago              │  │
│ │    "Statistics Canada reports..."                   │  │
│ │    [⭐ Promote] [👁 Read] [✕ Dismiss]              │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ Personal Blog (3 items)                                  │
│ Neolog (3 items)                                         │
│                                                           │
└─────────────────────────────────────────────────────────┘

Components:
├─ Filter Bar (top): Dropdown filters for pub, type, status
├─ Summary Stats: Item count, estimated time
├─ Bulk Actions: Promote/dismiss selected items
├─ Publication Sections: Collapsible groups
└─ Item Cards: Checkbox, preview, quick actions

Item Card States:
├─ Default: White border
├─ Hover: Blue border
├─ Selected: Blue background (10% opacity)
└─ Promoted: Green border (briefly, then removed)

Quick Actions:
├─ ⭐ Promote: Opens modal with tag/publication selection
├─ 👁 Read: Expands full content inline or opens modal
└─ ✕ Dismiss: Confirms (if accidental, undo available)

Keyboard Shortcuts:
├─ ↑/↓: Navigate items
├─ Space: Toggle selection
├─ P: Promote selected
├─ D: Dismiss selected
└─ R: Read expanded view
```

### Promote Modal

```
┌─────────────────────────────────────┐
│ Promote to Vault              [×]   │
├─────────────────────────────────────┤
│                                     │
│ Title: Poilievre Housing Plan       │
│ [──────────────────────────────]    │
│                                     │
│ Type: [Video Clip ▾]                │
│                                     │
│ Tags: housing, poilievre, policy    │
│ [──────────────────────────────]    │
│ Suggestions: [+ crisis] [+ video]   │
│                                     │
│ Publication: [CANOPTICON ▾]         │
│                                     │
│ Capture Options:                    │
│ ☑ Video URL + metadata              │
│ ☑ Full transcript                   │
│ ☐ Timestamp specific segments       │
│                                     │
│ Notes (optional):                   │
│ [────────────────────────────────]  │
│ [────────────────────────────────]  │
│                                     │
│        [Cancel] [Save to Vault]     │
└─────────────────────────────────────┘

Behavior:
├─ Pre-filled with extracted metadata
├─ Tag suggestions based on content analysis
├─ Type auto-detected but editable
├─ Publication defaults to monitor's publication
├─ Quick save: ⌘ + Enter
└─ After save: Item removed from review queue
```

---

## 4. VAULT INTERFACE

### Asset Grid View

```
┌─────────────────────────────────────────────────────────┐
│ Vault · All Assets                            [+ Capture]│
├─────────────────────────────────────────────────────────┤
│                                                           │
│ [Search assets...........................] [⌘F]          │
│                                                           │
│ Filters: [All Types ▾] [All Pubs ▾] [All Tags ▾] [Sort▾]│
│                                                           │
│ 490 assets                                                │
│                                                           │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│ │🎥      │ │📊      │ │💬      │ │📰      │            │
│ │Poilievr│ │Housing │ │Expert  │ │CBC     │            │
│ │Housing │ │Stats   │ │Quote   │ │Article │            │
│ │        │ │        │ │        │ │        │            │
│ │Video   │ │Data    │ │Quote   │ │Link    │            │
│ │housing │ │housing │ │housing │ │housing │            │
│ │3h ago  │ │2h ago  │ │1d ago  │ │5h ago  │            │
│ └────────┘ └────────┘ └────────┘ └────────┘            │
│                                                           │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│ │        │ │        │ │        │ │        │            │
│ [More assets in grid...]                                 │
│                                                           │
│ [Load More]                                               │
└─────────────────────────────────────────────────────────┘

Asset Card Anatomy:
┌────────────────┐
│ 🎥 [Icon]      │  ← Type icon (video, quote, image, etc)
│                │
│ Title          │  ← First 30 chars of title
│ (truncated)    │
│                │
│ Preview text   │  ← First 60 chars of content
│ ...            │
│                │
│ [Type Badge]   │  ← "Video", "Quote", "Data", etc
│ tag1, tag2     │  ← First 2 tags
│ 3h ago         │  ← Relative timestamp
└────────────────┘

Card Dimensions:
├─ Width: 200px
├─ Height: 240px (flexible based on content)
├─ Grid: 4 columns on desktop, 2 on tablet, 1 on mobile
└─ Gap: 16px

Card States:
├─ Default: zinc-800 border
├─ Hover: zinc-700 background, blue-500 border
├─ Selected: blue-500 background (20% opacity)
└─ Dragging: 50% opacity, cursor changes

Interactions:
├─ Click: Opens asset detail view
├─ Drag: Can drag to editor (if editor open)
├─ Right-click: Context menu (Edit, Delete, Copy link)
└─ Checkbox (hover): Multi-select for bulk actions

Search Bar:
├─ Full-text search across title, content, tags
├─ Semantic search toggle: [🔍 Semantic]
├─ Search as you type (debounced 300ms)
└─ Recent searches dropdown
```

### Asset Detail View

```
┌─────────────────────────────────────────────────────────┐
│ [← Back to Vault]                      [Edit] [Delete]   │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ 🎥 Poilievre announces housing plan                      │
│                                                           │
│ ┌───────────────────────────────────────────────────┐  │
│ │ [Video thumbnail or content preview]               │  │
│ │                                                     │  │
│ │ Full content displayed here...                      │  │
│ │ If video: embedded player                           │  │
│ │ If text: full text with formatting                  │  │
│ │ If image: full resolution image                     │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ METADATA                                                  │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Type:         Video Clip                            │  │
│ │ Source:       YouTube                               │  │
│ │ Author:       @PierrePoilievreMP                    │  │
│ │ URL:          [link]                                │  │
│ │ Captured:     3 hours ago (Jan 15, 2024 2:32 PM)   │  │
│ │ Publication:  CANOPTICON                            │  │
│ │ Tags:         housing, poilievre, policy            │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ USAGE HISTORY                                            │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Used in 2 posts:                                    │  │
│ │                                                     │  │
│ │ • "Poilievre Housing Analysis" (YouTube)           │  │
│ │   Published Jan 15, 2024 · 15.2K views             │  │
│ │                                                     │  │
│ │ • "Housing Crisis Thread" (X)                      │  │
│ │   Published Jan 15, 2024 · 23.4K impressions       │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ PERFORMANCE                                              │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Total reach:        38.6K impressions               │  │
│ │ Engagement impact:  +34% when included              │  │
│ │ Times used:         2 posts                         │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ RELATED ASSETS                                           │
│ ┌───────┐ ┌───────┐ ┌───────┐                          │
│ │Often  │ │Used   │ │Used   │                          │
│ │With   │ │With   │ │With   │                          │
│ └───────┘ └───────┘ └───────┘                          │
│                                                           │
│             [Use in New Post]                            │
└─────────────────────────────────────────────────────────┘

Layout:
├─ Header: Title, actions (edit, delete)
├─ Content Preview: Largest section, type-appropriate display
├─ Metadata Card: All capture details
├─ Usage History: Where this asset appears
├─ Performance: Analytics data
└─ Related Assets: Frequently used together

Actions:
├─ [Use in New Post]: Opens composer with this asset loaded
├─ [Edit]: Inline editing of title, tags, notes
├─ [Delete]: Confirmation modal (warns if used in posts)
└─ [Copy Link]: Copies internal neolog.ai/vault/[id] URL
```

---

## 5. PUBLICATIONS

### Publication List View

```
┌─────────────────────────────────────────────────────────┐
│ Your Publications                    [+ New Publication] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 📺 CANOPTICON                            Active •   │  │
│ │                                                     │  │
│ │ Canadian politics analysis                          │  │
│ │                                                     │  │
│ │ 490 assets · 5 new today · 12 published this month │  │
│ │                                                     │  │
│ │ Platforms: YouTube • X • TikTok • LinkedIn          │  │
│ │                                                     │  │
│ │ [Open Dashboard] [View Vault] [Settings]           │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 📝 Personal Blog                   Maintenance      │  │
│ │                                                     │  │
│ │ Media theory and McLuhan analysis                   │  │
│ │                                                     │  │
│ │ 230 assets · 2 new today · 3 published this month  │  │
│ │                                                     │  │
│ │ Platforms: Blog • X                                 │  │
│ │                                                     │  │
│ │ [Open Dashboard] [View Vault] [Settings]           │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ [More publications...]                                   │
│                                                           │
└─────────────────────────────────────────────────────────┘

Publication Card:
├─ Icon + Name (top)
├─ Status indicator (Active/Maintenance/Paused)
├─ Description
├─ Stats (assets, new items, published count)
├─ Connected platforms (icons)
└─ Quick actions

Card States:
├─ Active: Green dot indicator
├─ Maintenance: Yellow dot
├─ Paused: Gray dot
└─ Hover: Slight lift shadow effect

Quick Actions:
├─ [Open Dashboard]: → /publications/[id]
├─ [View Vault]: → /publications/[id]/vault
└─ [Settings]: → /publications/[id]/settings
```

### Publication Dashboard

```
┌─────────────────────────────────────────────────────────┐
│ 📺 CANOPTICON                                [Settings] │
├──────┬──────┬──────┬──────┬──────┬──────────────────────┤
│Dash  │Vault │Posts │Monit │Analy │                      │
│board │      │      │ored  │tics  │                      │
├──────┴──────┴──────┴──────┴──────┴──────────────────────┤
│                                                           │
│ OVERVIEW                                                  │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│ │ 490        │ │ 5          │ │ 12         │           │
│ │ Assets     │ │ New Today  │ │ Published  │           │
│ │            │ │            │ │ This Month │           │
│ └────────────┘ └────────────┘ └────────────┘           │
│                                                           │
│ MONITORS                                                  │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 8 new items waiting for review                     │  │
│ │                                                     │  │
│ │ • Poilievre Watch (YouTube) - 2 new                │  │
│ │ • Housing Policy News - 3 new                      │  │
│ │ • CanPol Reddit - 2 new                            │  │
│ │ • Housing Twitter - 1 new                          │  │
│ │                                                     │  │
│ │                                [Review All →]       │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ RECENT POSTS                                             │
│ ┌───────────────────────────────────────────────────┐  │
│ │ • "Poilievre Housing Analysis" (YouTube)           │  │
│ │   15.2K views · Published 5 hours ago               │  │
│ │                                                     │  │
│ │ • "Housing Crisis Thread" (X)                      │  │
│ │   23.4K impressions · Published 5 hours ago         │  │
│ │                                                     │  │
│ │ [View All Posts →]                                 │  │
│ └───────────────────────────────────────────────────┘  │
│                                                           │
│ QUICK ACTIONS                                            │
│ [+ New Post] [Review Monitors] [View Analytics]          │
│                                                           │
└─────────────────────────────────────────────────────────┘

Layout:
├─ Header: Publication name, icon, settings
├─ Tabs: Navigate between sections
├─ Overview: Key stats in card grid
├─ Monitors: Pending items summary with quick access
├─ Recent Posts: Latest published content
└─ Quick Actions: Primary workflows

Tab Navigation:
├─ Dashboard: Overview (current view)
├─ Vault: Publication-specific assets
├─ Posts: All posts for this publication
├─ Monitored: Review interface (filtered to this pub)
└─ Analytics: Performance data
```

---

## 6. COMPOSER INTERFACE

### Main Composition View

```
┌─────────────────────────────────────────────────────────┐
│ [← Publications]  New Post: CANOPTICON    [Publish ▾]   │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ Title: [Poilievre's Housing Plan Analysis............]   │
│                                                           │
│ Format: [YouTube Script ▾]    Status: Draft              │
│                                                           │
│ ┌──────────────────────────┬──────────────────────────┐ │
│ │                          │ VAULT                    │ │
│ │                          │ ─────                    │ │
│ │  EDITOR                  │ [Search assets.......🔍] │ │
│ │  ──────                  │                          │ │
│ │                          │ Filter: [CANOPTICON ▾]  │ │
│ │  # Hook (0:00-0:15)      │         [All Types ▾]   │ │
│ │                          │         [housing ×]     │ │
│ │  [Provocative opening]   │                          │ │
│ │                          │ 12 assets found          │ │
│ │                          │                          │ │
│ │  ## Context (0:15-1:00)  │ ┌──────────────────┐   │ │
│ │                          │ │🎥 Poilievre Plan │   │ │
│ │  [What happened...]      │ │Video · 12:34     │   │ │
│ │                          │ │housing, poilievre│   │ │
│ │  [Drag asset here or     │ │[Drag to use]     │   │ │
│ │   type to continue]      │ └──────────────────┘   │ │
│ │                          │                          │ │
│ │  ## Analysis (1:00-6:00) │ ┌──────────────────┐   │ │
│ │                          │ │📊 Housing Stats  │   │ │
│ │  [Your analysis...]      │ │Data · CBC        │   │ │
│ │                          │ │housing, data     │   │ │
│ │                          │ │[Drag to use]     │   │ │
│ │                          │ └──────────────────┘   │ │
│ │                          │                          │ │
│ │                          │ [More assets...]         │ │
│ │                          │                          │ │
│ │                          │ USED IN THIS POST (2)    │ │
│ │                          │ • Asset #47             │ │
│ │  [Continue writing...]   │ • Asset #52             │ │
│ │                          │                          │ │
│ │                          │                          │ │
│ └──────────────────────────┴──────────────────────────┘ │
│                                                           │
│ Auto-saved 30 seconds ago                                │
└─────────────────────────────────────────────────────────┘

Layout Proportions:
├─ Editor: 65% width (flexible, min 600px)
├─ Asset Drawer: 35% width (flexible, min 300px)
└─ Resizable divider between editor and drawer

Editor Features:
├─ Rich text formatting toolbar (sticky at top of editor)
│  └─ Bold, Italic, Headers, Lists, Links, Code, Quote
├─ Template structure (based on output format)
├─ Placeholder text guides for each section
├─ Drop zones for assets (highlighted on drag)
├─ Word count and estimated time display (bottom)
└─ Full-screen mode toggle

Asset Drawer Features:
├─ Search bar (searches publication vault)
├─ Filter dropdowns (publication, type, tags)
├─ Tag chips (click to filter, × to remove)
├─ Asset cards (smaller version of vault cards)
├─ Drag handle on each card
├─ "Used in this post" section (tracks assets added)
└─ Scroll independently from editor

Drag & Drop:
├─ Drag asset from drawer → editor
├─ Editor highlights valid drop zones
├─ On drop: Asset content inserted based on type
│  ├─ Quote: Blockquote with attribution
│  ├─ Image: Embedded image with caption
│  ├─ Video: Link with preview/transcript
│  ├─ Data: Formatted data block
│  └─ Text: Inline or block based on context
├─ Asset added to "Used in this post" tracker
└─ Undo available (⌘Z)
```

### Format Templates

Each output format has a different template structure:

**YouTube Script Template:**
```
# [Title]

## Hook (0:00-0:15)
[Provocative opening - drag asset or type]

## Context (0:15-1:00)
[What happened - drag assets]

## Analysis (1:00-6:00)
[Your analysis using vault materials]

### Point 1
[Subheading]
[Content with assets]

### Point 2
[Subheading]
[Content with assets]

## Conclusion (6:00-8:00)
[Wrap up and CTA]

---
SOURCES (Auto-populated from assets used):
• Asset #47: Poilievre Housing Announcement
• Asset #52: Housing Starts Data

METADATA:
Estimated length: 8:24
Word count: 1,245 words
Reading pace: 150 wpm
```

**X Thread Template:**
```
THREAD STRUCTURE

Tweet 1/7 [HOOK]
[Strong opening claim or question]
[280 char limit ─────────────────────]

Tweet 2/7 [CONTEXT]
[What happened, setup]
[280 char limit ─────────────────────]

Tweet 3/7 [ANALYSIS]
[Key point 1 with asset]
[280 char limit ─────────────────────]

[Continue for 7 tweets total...]

Tweet 7/7 [CONCLUSION]
[Wrap up + CTA]
[280 char limit ─────────────────────]

---
SETTINGS:
☑ Auto-number tweets (1/7, 2/7...)
☑ Split at character limits
☑ Add hashtags: #cdnpoli #housing
☐ Attach image
```

**Blog Post Template:**
```
# [Title]

[Opening paragraph - set the stage]

## Section 1
[Heading]

[Content with assets]

## Section 2
[Heading]

[Content with assets]

## Conclusion

[Wrap up]

---
METADATA:
Word count: 0
Estimated read time: 0 min
SEO: [Auto-generated suggestions]
```

### Editor Toolbar

```
┌─────────────────────────────────────────────────────┐
│ [B] [I] [H] [●] [1.] ["] [</>] [🔗] [📷]  [⋮ More] │
└─────────────────────────────────────────────────────┘

Buttons (left to right):
├─ B: Bold
├─ I: Italic
├─ H: Headings dropdown (H1, H2, H3)
├─ ●: Bullet list
├─ 1.: Numbered list
├─ ": Block quote
├─ </>: Code block
├─ 🔗: Insert link
├─ 📷: Insert image
└─ ⋮: More options dropdown
	├─ Horizontal rule
	├─ Table
	├─ Clear formatting
	└─ HTML mode

Keyboard Shortcuts (shown on hover):
├─ ⌘B: Bold
├─ ⌘I: Italic
├─ ⌘K: Insert link
├─ ⌘⇧7: Bullet list
└─ ⌘⇧8: Numbered list
```

---

## 7. DISTRIBUTION INTERFACE

### Publish & Distribute Flow

```
┌─────────────────────────────────────────────────────────┐
│ Publish & Distribute                              [× Close]│
├─────────────────────────────────────────────────────────┤
│                                                           │
│ Post: "Poilievre's Housing Plan Analysis"                │
│ Publication: CANOPTICON                                   │
│                                                           │
│ ┌─── PRIMARY FORMAT ────────────────────────────────┐   │
│ │                                                     │   │
│ │ YouTube Script                                      │   │
│ │ ─────────────────                                  │   │
│ │ ✓ Script ready (1,245 words, ~8 min)              │   │
│ │ ✓ Description generated                            │   │
│ │ ✓ Timestamps added                                 │   │
│ │                                                     │   │
│ │ [Preview Script] [Copy to Clipboard]               │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── DISTRIBUTION FORMATS ──────────────────────────┐   │
│ │                                                     │   │
│ │ ☑ X Thread (7 tweets) @canopticon_ca              │   │
│ │   ┌─────────────────────────────────────────────┐ │   │
│ │   │ 1/7 Poilievre just announced his housing    │ │   │
│ │   │     plan. Claims 1M homes in 3 years. Let's │ │   │
│ │   │     analyze what's actually in it. 🧵       │ │   │
│ │   │                                              │ │   │
│ │   │ 2/7 Core promise: "Remove gatekeepers" and  │ │   │
│ │   │     link federal funding to units built...  │ │   │
│ │   │                                              │ │   │
│ │   │ [View all 7 tweets...]                      │ │   │
│ │   └─────────────────────────────────────────────┘ │   │
│ │   [Edit Thread] [Post Now] [Schedule] [Draft]    │   │
│ │                                                     │   │
│ │ ☑ TikTok Caption                                   │   │
│ │   ┌─────────────────────────────────────────────┐ │   │
│ │   │ Poilievre says 1M homes. But starts dropped │ │   │
│ │   │ 20%. Here's what's missing... #cdnpoli      │ │   │
│ │   └─────────────────────────────────────────────┘ │   │
│ │   [Copy Caption] (Manual upload to TikTok)        │   │
│ │                                                     │   │
│ │ ☐ LinkedIn Post (Optional)                         │   │
│ │   [Generate Professional Version]                  │   │
│ │                                                     │   │
│ │ ☐ Blog Post (neolog.ai/canopticon/...)            │   │
│ │   [Publish to Blog]                                │   │
│ │                                                     │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── SCHEDULE OPTIONS ──────────────────────────────┐   │
│ │ When to post:                                       │   │
│ │ ○ Post immediately                                  │   │
│ │ ○ Save as drafts (review in platform)             │   │
│ │ ● Schedule for: [Jan 15, 2024] [2:00 PM] [EST]    │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│         [Cancel] [Save Drafts] [Distribute Selected]     │
└─────────────────────────────────────────────────────────┘

Modal Sections:
├─ Header: Post title, publication
├─ Primary Format: Original content ready
├─ Distribution Formats: Checkboxes for each platform
│  └─ Each shows preview, edit, and post options
├─ Schedule Options: Timing control
└─ Actions: Cancel, save, or execute

Each Platform Section:
├─ Checkbox to enable/disable
├─ Preview pane (collapsible)
├─ Edit button (opens inline editor)
├─ Post action buttons
│  ├─ [Post Now]: Immediate posting
│  ├─ [Schedule]: Set specific time
│  ├─ [Draft]: Save to platform as draft
│  └─ [Copy]: Copy to clipboard
└─ Connection status indicator

Preview Editing:
├─ Click [Edit Thread/Post]
├─ Opens inline editor
├─ Can modify generated content
├─ Preserves original in database
└─ "Revert to auto-generated" option available
```

### Distribution Preview - X Thread Detail

```
┌─────────────────────────────────────────────────────┐
│ X Thread Preview                                [Edit]│
├─────────────────────────────────────────────────────┤
│                                                       │
│ Account: @canopticon_ca                              │
│ Total: 7 tweets, 945 characters                      │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 1/7                                             │ │
│ │ Poilievre just announced his housing plan.     │ │
│ │ Claims he'll build 1M homes in 3 years.        │ │
│ │ Let's analyze what's actually in it. 🧵        │ │
│ │                                        [245/280]│ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 2/7                                             │ │
│ │ The core promise: "Remove gatekeepers" and     │ │
│ │ link federal infrastructure funding to         │ │
│ │ housing units built. Sounds good - but...      │ │
│ │                                        [198/280]│ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 3/7                                             │ │
│ │ Housing starts dropped 20% this year           │ │
│ │ (StatsCan data). The problem isn't just        │ │
│ │ regulation - it's financing, labor, materials. │ │
│ │                                        [156/280]│ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ [4/7 - 7/7 collapsed, click to expand]               │
│                                                       │
│ Settings:                                            │
│ ☑ Add thread numbering (1/7, 2/7...)                │
│ ☑ Include hashtags in final tweet                   │
│ ☑ Optimize for engagement times                     │
│                                                       │
│ Hashtags: #cdnpoli #housing #canadianpolitics       │
│ [+ Add hashtag]                                      │
│                                                       │
│ Image (Optional):                                    │
│ ○ No image                                           │
│ ○ Attach from vault: [Select Image ▾]               │
│                                                       │
│ Best time to post: Today at 7:30 AM EST             │
│ (Based on your audience engagement)                  │
│                                                       │
│        [Cancel] [Save Draft] [Schedule] [Post Now]   │
└─────────────────────────────────────────────────────┘

Features:
├─ Each tweet shown in card
├─ Character count per tweet
├─ Expand/collapse tweet list
├─ Inline editing capability
├─ Settings toggles
├─ Hashtag management
├─ Image attachment option
├─ Optimal posting time suggestion
└─ Multiple posting options
```

### Post-Distribution Confirmation

```
┌─────────────────────────────────────────────────────┐
│ Distribution Complete                          [×]   │
├─────────────────────────────────────────────────────┤
│                                                       │
│ ✓ "Poilievre's Housing Plan Analysis" distributed   │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✓ X Thread                                      │ │
│ │   Posted to @canopticon_ca                      │ │
│ │   → https://x.com/canopticon_ca/status/...      │ │
│ │   [View on X]                                   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✓ YouTube Description                           │ │
│ │   Copied to clipboard                           │ │
│ │   [Copy Again]                                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✓ TikTok Caption                                │ │
│ │   Copied to clipboard                           │ │
│ │   [Copy Again]                                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ Engagement tracking enabled                          │
│ Analytics will update automatically                  │
│                                                       │
│             [View in Analytics] [Done]               │
└─────────────────────────────────────────────────────┘

Behavior:
├─ Shows success for each distribution
├─ Provides direct links to posted content
├─ Copy buttons for clipboard items
├─ Confirmation of tracking enabled
└─ Quick nav to analytics or close
```

---

## 8. ANALYTICS INTERFACE

### Publication Analytics Dashboard

```
┌─────────────────────────────────────────────────────────┐
│ CANOPTICON Analytics                                     │
├──────┬──────┬──────┬──────┬──────────────────────────────┤
│Dash  │Vault │Posts │Monit │Analytics                     │
│board │      │      │ored  │                              │
├──────┴──────┴──────┴──────┴──────────────────────────────┤
│                                                           │
│ Period: [Last 30 Days ▾]              [Export Report]   │
│                                                           │
│ ┌─── OVERVIEW ──────────────────────────────────────┐   │
│ │                                                     │   │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│ │ │ 287,450  │ │ 12       │ │ 47       │           │   │
│ │ │ Total    │ │ Posts    │ │ Assets   │           │   │
│ │ │ Reach    │ │ Published│ │ Used     │           │   │
│ │ └──────────┘ └──────────┘ └──────────┘           │   │
│ │                                                     │   │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│ │ │ 8,340    │ │ 2.9%     │ │ 12 hrs   │           │   │
│ │ │ Total    │ │ Avg      │ │ Time     │           │   │
│ │ │ Engage   │ │ Engage   │ │ Invested │           │   │
│ │ └──────────┘ └──────────┘ └──────────┘           │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── PLATFORM BREAKDOWN ────────────────────────────┐   │
│ │                                                     │   │
│ │ YouTube                            ▲ +12% vs prev │   │
│ │ ├─ 3 videos                                        │   │
│ │ ├─ 42,100 views                                    │   │
│ │ ├─ 80% avg retention                               │   │
│ │ └─ Top: "Housing Crisis" (15.2K views)            │   │
│ │                                                     │   │
│ │ X/Twitter                          ▲ +24% vs prev │   │
│ │ ├─ 45 threads                                      │   │
│ │ ├─ 189,300 impressions                             │   │
│ │ ├─ 2.2% engagement rate                            │   │
│ │ └─ Top: "Poilievre Analysis" (23.4K impr)         │   │
│ │                                                     │   │
│ │ TikTok                             ▲ +8% vs prev  │   │
│ │ ├─ 8 videos                                        │   │
│ │ ├─ 53,850 views                                    │   │
│ │ ├─ 4,120 likes                                     │   │
│ │ └─ Top: "Why Housing Failed" (18.9K views)        │   │
│ │                                                     │   │
│ │ LinkedIn                           ▼ -5% vs prev  │   │
│ │ ├─ 15 posts                                        │   │
│ │ ├─ 2,200 impressions                               │   │
│ │ ├─ 87 reactions                                    │   │
│ │ └─ Top: "Policy Analysis" (420 impr)              │   │
│ │                                                     │   │
│ │ [View Platform Comparison →]                       │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── TOP PERFORMING CONTENT ────────────────────────┐   │
│ │                                                     │   │
│ │ 1. "Poilievre Housing Analysis" (YouTube)         │   │
│ │    15.2K views • 82% retention • 234 likes         │   │
│ │    Assets used: #47, #52, #61, #89                │   │
│ │    [View Details →]                                │   │
│ │                                                     │   │
│ │ 2. "Housing Crisis Thread" (X)                     │   │
│ │    23.4K impressions • 412 engagements             │   │
│ │    Assets used: #47, #52, #61                      │   │
│ │    [View Details →]                                │   │
│ │                                                     │   │
│ │ 3. "Why Housing Failed" (TikTok)                   │   │
│ │    18.9K views • 1.2K likes • 89 shares            │   │
│ │    Assets used: #47, #61                           │   │
│ │    [View Details →]                                │   │
│ │                                                     │   │
│ │ [View All Posts →]                                 │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── ASSET PERFORMANCE ─────────────────────────────┐   │
│ │                                                     │   │
│ │ Top Performing Assets:                             │   │
│ │                                                     │   │
│ │ #52: "Housing Starts Data" (StatsCan)             │   │
│ │ ├─ Used in 8 posts                                 │   │
│ │ ├─ 94.3K total reach                               │   │
│ │ └─ +34% engagement when included                   │   │
│ │ [View Lineage →]                                   │   │
│ │                                                     │   │
│ │ #47: "Poilievre Housing Announcement"             │   │
│ │ ├─ Used in 5 posts                                 │   │
│ │ ├─ 67.8K total reach                               │   │
│ │ └─ +28% engagement when included                   │   │
│ │ [View Lineage →]                                   │   │
│ │                                                     │   │
│ │ #61: "Expert Quote" (Prof. Smith)                 │   │
│ │ ├─ Used in 4 posts                                 │   │
│ │ ├─ 52.1K total reach                               │   │
│ │ └─ +41% engagement when included                   │   │
│ │ [View Lineage →]                                   │   │
│ │                                                     │   │
│ │ Insight: Content using data + video + expert      │   │
│ │ quote performs 2.3x better                         │   │
│ │                                                     │   │
│ │ [View All Assets →]                                │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── AUDIENCE INSIGHTS ─────────────────────────────┐   │
│ │                                                     │   │
│ │ Best Posting Times:                                │   │
│ │ ├─ X: Weekdays 7-9am, 12-1pm EST                  │   │
│ │ ├─ YouTube: Weekend mornings                       │   │
│ │ └─ TikTok: Evenings 7-10pm                        │   │
│ │                                                     │   │
│ │ Top Hashtags:                                      │   │
│ │ ├─ #cdnpoli (45K reach)                           │   │
│ │ ├─ #housing (38K reach)                           │   │
│ │ └─ #canadianpolitics (29K reach)                  │   │
│ │                                                     │   │
│ │ Engagement Trends:                                 │   │
│ │ [Line chart showing engagement over time]          │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
└─────────────────────────────────────────────────────────┘

Layout Structure:
├─ Period selector (top right)
├─ Overview metrics (6 key stats)
├─ Platform breakdown (expandable sections)
├─ Top content (ranked list)
├─ Asset performance (top assets with impact)
└─ Audience insights (timing, hashtags, trends)

Interactions:
├─ Click platform → detailed platform view
├─ Click post → post detail with full analytics
├─ Click asset → asset lineage view
├─ Export → PDF or CSV download
└─ Period selector → refresh all data
```

### Asset Lineage View

```
┌─────────────────────────────────────────────────────────┐
│ [← Back to Analytics]                                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ Asset #52: "Housing Starts Data" (StatsCan)             │
│                                                           │
│ ┌─── ASSET DETAILS ─────────────────────────────────┐   │
│ │ Type: Data                                         │   │
│ │ Source: Statistics Canada                          │   │
│ │ Captured: Jan 8, 2024                             │   │
│ │ Tags: housing, data, statistics, canada            │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── PERFORMANCE SUMMARY ───────────────────────────┐   │
│ │ Total Reach:        94,300 impressions            │   │
│ │ Total Engagement:   2,840 interactions            │   │
│ │ Times Used:         8 posts                        │   │
│ │ Avg Impact:         +34% engagement when included │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── CONTENT LINEAGE ───────────────────────────────┐   │
│ │                                                     │   │
│ │ ASSET #52                                          │   │
│ │    ↓                                                │   │
│ │ POST 1: "Poilievre Housing Analysis" (Jan 15)     │   │
│ │    ├─→ YouTube: 15.2K views, 234 likes            │   │
│ │    ├─→ X Thread: 23.4K impr, 412 engagements      │   │
│ │    └─→ LinkedIn: 420 impr, 18 reactions           │   │
│ │                                                     │   │
│ │ POST 2: "Housing Starts Breakdown" (Jan 12)       │   │
│ │    └─→ X Thread: 18.7K impr, 286 engagements      │   │
│ │                                                     │   │
│ │ POST 3: "Crisis Explained" (Jan 14)               │   │
│ │    ├─→ TikTok: 8.4K views, 520 likes              │   │
│ │    └─→ Blog: 1.2K views, 45 shares                │   │
│ │                                                     │   │
│ │ [View all 8 uses →]                                │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── OFTEN USED WITH ───────────────────────────────┐   │
│ │                                                     │   │
│ │ These assets frequently appear together:           │   │
│ │                                                     │   │
│ │ Asset #47: Poilievre Video (5 times together)     │   │
│ │ Combined reach: 156K                               │   │
│ │ Combined engagement rate: 3.2%                     │   │
│ │                                                     │   │
│ │ Asset #61: Expert Quote (4 times together)        │   │
│ │ Combined reach: 124K                               │   │
│ │ Combined engagement rate: 3.8%                     │   │
│ │                                                     │   │
│ │ Recommendation: This combination drives highest    │   │
│ │ engagement. Use together in future content.        │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
└─────────────────────────────────────────────────────────┘

Features:
├─ Asset details at top
├─ Performance summary metrics
├─ Visual lineage tree showing asset → posts → distributions
├─ Expandable sections for detailed view
├─ Frequently combined assets with performance data
└─ Actionable recommendations based on data
```

---

## 9. SETTINGS & CONFIGURATION

### Platform Connections

```
┌─────────────────────────────────────────────────────────┐
│ Settings → Platform Connections                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ Connect your social media accounts for direct posting.   │
│                                                           │
│ ┌─── CONNECTED PLATFORMS ───────────────────────────┐   │
│ │                                                     │   │
│ │ ✓ X/Twitter                                        │   │
│ │   @canopticon_ca                                   │   │
│ │   Connected Jan 10, 2024                           │   │
│ │   [Disconnect] [Test Connection]                   │   │
│ │                                                     │   │
│ │ ✓ YouTube                                          │   │
│ │   CANOPTICON Channel                               │   │
│ │   Connected Jan 10, 2024                           │   │
│ │   [Disconnect] [Test Connection]                   │   │
│ │                                                     │   │
│ │ ✓ LinkedIn                                         │   │
│ │   Chris [Your Name]                                │   │
│ │   Connected Jan 10, 2024                           │   │
│ │   [Disconnect] [Test Connection]                   │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── AVAILABLE PLATFORMS ───────────────────────────┐   │
│ │                                                     │   │
│ │ ○ TikTok                                           │   │
│ │   [Connect Account]                                │   │
│ │   Note: API access limited. Caption generation     │   │
│ │   available, but videos must be uploaded manually. │   │
│ │                                                     │   │
│ │ ○ Substack                                         │   │
│ │   [Connect via API Key]                            │   │
│ │                                                     │   │
│ │ ○ Medium                                           │   │
│ │   [Connect via API Key]                            │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── API USAGE ─────────────────────────────────────┐   │
│ │                                                     │   │
│ │ X/Twitter:   142 / 500 requests today             │   │
│ │ YouTube:      38 / 10,000 requests today           │   │
│ │ LinkedIn:     12 / 100 requests today              │   │
│ │                                                     │   │
│ │ Rate limits reset at midnight EST                  │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
└─────────────────────────────────────────────────────────┘

Platform Connection Flow:
1. Click [Connect Account]
2. Redirect to platform OAuth
3. Grant permissions
4. Return to Neolog with confirmation
5. Test connection automatically
6. Platform ready for use

Each Connected Platform Shows:
├─ Platform name and icon
├─ Connected account name
├─ Connection date
├─ Actions: Disconnect, Test Connection
└─ Usage stats (API rate limits)
```

### API & Webhooks

```
┌─────────────────────────────────────────────────────────┐
│ Settings → API & Webhooks                               │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ ┌─── CAPTURE WEBHOOK ───────────────────────────────┐   │
│ │                                                     │   │
│ │ Use this endpoint to capture content from          │   │
│ │ external systems (Claude, Gemini, scripts, etc.)   │   │
│ │                                                     │   │
│ │ Webhook URL:                                       │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ https://api.neolog.ai/v1/capture          │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │ [Copy URL]                                         │   │
│ │                                                     │   │
│ │ Your API Key:                                      │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ nlg_1234567890abcdef... (click to reveal)  │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │ [Show Key] [Copy Key] [Regenerate]                │   │
│ │                                                     │   │
│ │ [View Documentation →]                             │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── EXAMPLE REQUEST ───────────────────────────────┐   │
│ │                                                     │   │
│ │ curl -X POST \                                     │   │
│ │   https://api.neolog.ai/v1/capture \              │   │
│ │   -H "Authorization: Bearer YOUR_API_KEY" \        │   │
│ │   -H "Content-Type: application/json" \            │   │
│ │   -d '{                                            │   │
│ │     "type": "fragment",                            │   │
│ │     "content": "Your content here",                │   │
│ │     "title": "Optional title",                     │   │
│ │     "tags": ["tag1", "tag2"],                      │   │
│ │     "publication_id": "uuid-optional",             │   │
│ │     "source": "Claude"                             │   │
│ │   }'                                               │   │
│ │                                                     │   │
│ │ [Copy Example]                                     │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── EMAIL FORWARDING ──────────────────────────────┐   │
│ │                                                     │   │
│ │ Forward emails to this address to capture content: │   │
│ │                                                     │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ capture-xk9j2@neolog.ai                     │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │ [Copy Address]                                     │   │
│ │                                                     │   │
│ │ Subject line format: [tag1, tag2] Optional Title   │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─── RECENT CAPTURES ───────────────────────────────┐   │
│ │                                                     │   │
│ │ • 15 captures via webhook today                    │   │
│ │ • 3 captures via email today                       │   │
│ │ • Last capture: 23 minutes ago (from Claude)       │   │
│ │                                                     │   │
│ │ [View All Captures →]                              │   │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
└─────────────────────────────────────────────────────────┘

Features:
├─ Webhook URL (always same, unique per user)
├─ API key management (show/hide, regenerate)
├─ Example requests (copy-pasteable)
├─ Email forwarding address (unique per user)
├─ Usage stats (recent captures)
└─ Link to full API documentation
```

---

## 10. QUICK CAPTURE MODAL

### Universal Capture Modal (⌘K)

```
┌─────────────────────────────────────────────────────┐
│ Quick Capture                                  [×]  │
├─────────────────────────────────────────────────────┤
│                                                       │
│ [Paste or type content here.....................]    │
│ [...............................................]    │
│ [...............................................]    │
│ [...............................................]    │
│                                                       │
│ Type: [Text Fragment ▾]                              │
│                                                       │
│ Title (optional):                                    │
│ [................................................]    │
│                                                       │
│ Tags:                                                │
│ [........................................] [+ Add]   │
│ [idea] [notes] [×]  Suggestions: [ai] [thoughts]    │
│                                                       │
│ Publication: [CANOPTICON ▾]  or  [Global Vault]     │
│                                                       │
│             [Cancel]  [Save to Vault] [⌘↵]           │
└─────────────────────────────────────────────────────┘

Trigger:
├─ ⌘K from anywhere in Neolog
├─ Also accessible via top bar button
└─ Opens as overlay modal

Type Detection:
├─ Auto-detects type from content
├─ URLs → Link type
├─ Image paste → Image type
├─ Code syntax → Code type
├─ Default → Text fragment
└─ User can override with dropdown

Tag Suggestions:
├─ Based on content analysis
├─ Based on frequently used tags
├─ Based on selected publication tags
└─ Click to add, or type custom

Quick Save:
├─ ⌘ + Enter to save immediately
├─ Minimal required fields (content only)
├─ Everything else optional
└─ Confirmation toast on save
```

---

## 11. RESPONSIVE DESIGN NOTES

### Mobile View Adaptations

**Dashboard (Mobile):**
```
┌──────────────────────┐
│ ☰  Neolog      [+]   │  ← Hamburger menu, quick capture
├──────────────────────┤
│                      │
│ Good morning, Chris  │
│                      │
│ MONITOR UPDATES      │
│ ┌──────────────────┐│
│ │ 14 new items     ││
│ │ [Review →]       ││
│ └──────────────────┘│
│                      │
│ PUBLICATIONS         │
│ ┌──────────────────┐│
│ │ 📺 CANOPTICON    ││
│ │ 490 assets       ││
│ │ 5 new today      ││
│ └──────────────────┘│
│ ┌──────────────────┐│
│ │ 📝 Personal Blog ││
│ │ 230 assets       ││
│ │ 2 new today      ││
│ └──────────────────┘│
│                      │
│ [+ New Publication]  │
│                      │
└──────────────────────┘

Changes:
├─ Side nav collapses to hamburger menu
├─ Publications stack vertically (1 column)
├─ Cards full width
├─ Simplified stats (only key metrics)
└─ Touch-optimized tap targets (min 44px)
```

**Vault (Mobile):**
```
┌──────────────────────┐
│ ☰  Vault        [+]  │
├──────────────────────┤
│ [Search........] [🔍]│
│                      │
│ Filters ▾  Sort ▾    │
│                      │
│ ┌──────────────────┐│
│ │ 🎥 Poilievre    ││
│ │ Housing Plan     ││
│ │ Video · housing  ││
│ │ 3h ago           ││
│ └──────────────────┘│
│ ┌──────────────────┐│
│ │ 📊 Housing Stats ││
│ │ Data · StatsCan  ││
│ │ 2h ago           ││
│ └──────────────────┘│
│                      │
│ [Load More]          │
└──────────────────────┘

Changes:
├─ Single column grid
├─ Larger cards (easier to tap)
├─ Simplified filters (drawer on mobile)
├─ No drag-and-drop (tap to select)
└─ Pull to refresh
```

**Composer (Mobile):**
```
┌──────────────────────┐
│ ← New Post      [⋮]  │  ← Back, options menu
├──────────────────────┤
│ Title:               │
│ [...................] │
│                      │
│ Format: YouTube ▾    │
│                      │
│ ┌──────────────────┐│
│ │                  ││
│ │ Editor here...   ││
│ │ (full screen)    ││
│ │                  ││
│ │                  ││
│ └──────────────────┘│
│                      │
│ [📎 Assets] [Publish]│  ← Bottom bar
└──────────────────────┘

When [📎 Assets] tapped:
┌──────────────────────┐
│ Assets          [×]  │
├──────────────────────┤
│ [Search.........] 🔍 │
│                      │
│ ┌──────────────────┐│
│ │ 🎥 Asset 1      ││
│ │ [Tap to Insert] ││
│ └──────────────────┘│
│ ┌──────────────────┐│
│ │ 📊 Asset 2      ││
│ │ [Tap to Insert] ││
│ └──────────────────┘│
│                      │
└──────────────────────┘

Changes:
├─ Asset drawer becomes full-screen sheet
├─ Tap to insert instead of drag
├─ Simplified toolbar (essential only)
├─ Bottom action bar for key functions
└─ Auto-save more frequent (every 15s)
```

### Tablet View

**Tablet uses hybrid approach:**
- Portrait: Similar to mobile (stacked layout)
- Landscape: Similar to desktop (side-by-side)
- Asset drawer can be side panel or bottom sheet
- Touch and keyboard both supported

---

## 12. COMPONENT SPECIFICATIONS

### Button Styles

```css
/* Primary Button */
.btn-primary {
	background: rgb(59, 130, 246); /* blue-500 */
	color: white;
	padding: 8px 16px;
	border-radius: 6px;
	font-weight: 600;
	transition: background 150ms;
}
.btn-primary:hover {
	background: rgb(37, 99, 235); /* blue-600 */
}

/* Secondary Button */
.btn-secondary {
	background: transparent;
	color: rgb(59, 130, 246); /* blue-500 */
	border: 1px solid rgb(59, 130, 246);
	padding: 8px 16px;
	border-radius: 6px;
	font-weight: 600;
}
.btn-secondary:hover {
	background: rgba(59, 130, 246, 0.1);
}

/* Destructive Button */
.btn-destructive {
	background: rgb(239, 68, 68); /* red-500 */
	color: white;
	padding: 8px 16px;
	border-radius: 6px;
	font-weight: 600;
}
.btn-destructive:hover {
	background: rgb(220, 38, 38); /* red-600 */
}

/* Ghost Button */
.btn-ghost {
	background: transparent;
	color: zinc-50;
	padding: 8px 16px;
	border-radius: 6px;
}
.btn-ghost:hover {
	background: zinc-800;
}
```

### Card Styles

```css
.card {
	background: rgb(24, 24, 27); /* zinc-900 */
	border: 1px solid rgb(39, 39, 42); /* zinc-800 */
	border-radius: 8px;
	padding: 16px;
}

.card-hover {
	transition: all 150ms;
}
.card-hover:hover {
	border-color: rgb(59, 130, 246); /* blue-500 */
	box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5);
}
```

### Input Styles

```css
.input {
	background: rgb(9, 9, 11); /* zinc-950 */
	border: 1px solid rgb(39, 39, 42); /* zinc-800 */
	border-radius: 6px;
	padding: 8px 12px;
	color: rgb(250, 250, 250); /* zinc-50 */
	font-size: 14px;
}
.input:focus {
	outline: none;
	border-color: rgb(59, 130, 246); /* blue-500 */
	box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
.input::placeholder {
	color: rgb(113, 113, 122); /* zinc-500 */
}
```

### Dropdown Styles

```css
.dropdown-trigger {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 12px;
	background: zinc-900;
	border: 1px solid zinc-800;
	border-radius: 6px;
	cursor: pointer;
}

.dropdown-menu {
	position: absolute;
	top: 100%;
	margin-top: 4px;
	background: zinc-900;
	border: 1px solid zinc-800;
	border-radius: 6px;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
	min-width: 200px;
	z-index: 1000;
}

.dropdown-item {
	padding: 8px 12px;
	cursor: pointer;
	transition: background 150ms;
}
.dropdown-item:hover {
	background: zinc-800;
}
```

### Toast Notifications

```
┌──────────────────────────────┐
│ ✓ Asset saved to vault       │
│   "Housing Stats" captured   │
└──────────────────────────────┘

Position: Bottom right
Duration: 3 seconds
Animation: Slide in from bottom

Types:
├─ Success (green icon)
├─ Error (red icon)
├─ Warning (yellow icon)
└─ Info (blue icon)
```

---

## 13. ACCESSIBILITY REQUIREMENTS

### Keyboard Navigation

**Global Shortcuts:**
- `⌘K` - Quick capture
- `⌘N` - New post
- `⌘F` - Search vault
- `⌘P` - Publish & distribute
- `⌘/` - Command palette
- `Esc` - Close modal/drawer

**List Navigation:**
- `↑/↓` - Navigate items
- `Space` - Select/deselect
- `Enter` - Open/activate
- `Tab` - Move between sections
- `⇧Tab` - Move backwards

**Editor:**
- Standard text editing shortcuts
- `⌘B` - Bold
- `⌘I` - Italic
- `⌘K` - Insert link
- `⌘Z` - Undo
- `⌘⇧Z` - Redo

### Screen Reader Support

**ARIA Labels:**
- All interactive elements have descriptive labels
- Form inputs have associated labels
- Buttons describe their action
- Status messages announced

**Semantic HTML:**
- Proper heading hierarchy (h1 → h6)
- Landmarks (`nav`, `main`, `aside`)
- Lists use `ul`/`ol` + `li`
- Tables use proper structure

**Focus Management:**
- Visible focus indicators (2px blue outline)
- Logical tab order
- Focus trap in modals
- Return focus after modal close

### Color Contrast

**WCAG AA Compliance:**
- Text: Minimum 4.5:1 ratio
- Large text: Minimum 3:1 ratio
- UI components: Minimum 3:1 ratio
- Focus indicators: High contrast

**Color Independence:**
- Never rely on color alone
- Use icons + text for status
- Patterns in addition to color
- High contrast mode support

---

This UI specification provides complete interface designs for all major views and components in Neolog. It's designed to be implementable directly by development teams while maintaining consistency with the product architecture.
