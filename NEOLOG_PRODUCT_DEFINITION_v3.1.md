# NEOLOG.AI // Product Definition v3.1
## The Central Node
## Complete System Architecture & Technical Specification

Date: 2026-01-05

Important (alignment note)
- This is a refined **complete vision** document.
- It is **not** a directive to delete or rewrite what already exists.
- Use it to guide future work, shape roadmap priorities, and ensure consistency.

This document describes the target end-state architecture for Neolog as a unified creative infrastructure system.

## Version Evolution Summary (context)

Version 2.0 - "Capture-First Foundation"
- Core problem definition (multi-system native, scattered insights)
- Three-piece architecture: Capture → Vault → Composer
- Focus on manual capture + webhooks
- Publications NOT yet included
- Monitors NOT yet included
- Distribution NOT yet included
- Build phases with timeline warnings

Version 2.1 - "Capture-First + Publications Layer"
- Everything from 2.0
- ADDED: Publications as organizational layer
- ADDED: Monitors as optional automation (Layer 3)
- Still capture-first foundation
- Publications described as "optional structure"
- Monitors presented as supplementary to manual capture

Version 3.0 - "The Central Node"
- Complete rewrite with integrated approach
- Six-layer architecture: Capture → Organize → Monitor → Compose → Distribute → Analyze
- Publications integrated as core (not optional)
- Monitors integrated as core
- ADDED: Distribution layer (platform connections, posting)
- ADDED: Analytics layer (performance tracking)
- Multi-project workflow emphasized

Version 3.1 - "Clean Technical Spec"
- Same six-layer architecture as 3.0
- REMOVED: Timeline prescriptions and usage pattern advice
- KEPT: Complete system architecture
- KEPT: All six layers fully detailed
- Pure technical documentation
- Implementable by development teams

---

---

## 1. SYSTEM OVERVIEW

### What Neolog Is

Neolog is a complete creative infrastructure system that unifies capture, organization, composition, and distribution for multi-system, multi-project creators.

**The Complete Pipeline:**
```
CAPTURE → ORGANIZE → MONITOR → COMPOSE → DISTRIBUTE → ANALYZE
```

**Core Capabilities:**
- Universal capture from any source (manual, automated, AI systems, monitors)
- Project-based organization (Publications as containers)
- Multi-format content composition with asset reuse
- Direct platform distribution (X, YouTube, LinkedIn, TikTok)
- Unified performance analytics across all projects and platforms

**Key Differentiator:**
Single system replacing scattered tools (Buffer, Notion, bookmarking services, multiple platform dashboards). Everything flows through Neolog - one login, one interface, one source of truth.

---

## 2. THE SIX-LAYER ARCHITECTURE

### LAYER 1: CAPTURE (Universal Intake)

**Capture Methods:**

#### A. Browser Extension
- One-click "Share to Neolog" on any webpage
- Supported platforms: X/Twitter, YouTube, Reddit, articles, any URL
- Extracts clean content + full metadata (author, date, source URL)
- Quick tag/publication assignment before save
- Install targets: Chrome, Firefox, Safari (Manifest V3)

#### B. Webhook API
```typescript
POST https://api.neolog.ai/api/v1/capture

// Compatibility note:
// In this repo, /api/v1/capture is an alias of /api/capture.

Headers:
  Authorization: Bearer {user_api_key}
  Content-Type: application/json

Body:
{
  "type": "text" | "image" | "prompt" | "quote" | "code" | "link" | "video_clip" | "audio",
  "content": "string (required)",
  "title": "string (optional)",
  "tags": ["tag1", "tag2"],
  "publication_id": "uuid (optional)",
  "source": "Claude|Gemini|ChatGPT|Custom",
  "source_url": "https://...",
  "context": "Additional context or notes"
}

Response: 201 Created
{
  "asset_id": "uuid",
  "vault_url": "https://neolog.ai/vault/{asset_id}"
}
```

**Use case:** Push content from AI chat sessions, scripts, automation tools

#### C. Manual Entry
- Quick-add modal (⌘K keyboard shortcut)
- Paste or type content directly
- Full metadata control
- Bulk import support (CSV, JSON)

#### D. Email Forwarding
```
Forward to: capture@neolog.ai
Subject: [tag1, tag2] Optional Title
Body: Content to capture

Auto-parsed into vault with tags
```

**Asset Types Supported:**
- **Prompts** - Reusable AI prompts
- **Quotes** - Text from others (with attribution)
- **Images** - Visual references, generated art
- **Fragments** - Your own writing snippets
- **Code** - Scripts, snippets
- **Links** - URLs with context
- **Video Clips** - YouTube segments (with timestamps)
- **Audio** - Voice notes, podcast clips

**Metadata Schema:**
```typescript
interface Asset {
  id: string;
  user_id: string;
  publication_id?: string; // null = global vault
  type: AssetType;
  content: string;
  title?: string;
  tags: string[];
  source_platform: string; // 'x', 'claude', 'youtube', 'manual', 'monitor', etc
  source_url?: string;
  source_author?: string;
  metadata: Record<string, any>; // flexible for source-specific data
  embedding: number[]; // 1536-dimensional vector for semantic search
  created_at: Date;
  updated_at: Date;
}
```

---

### LAYER 2: ORGANIZE (Publications)

**What Publications Are:**
Project-specific containers that organize all aspects of a creative project - its vault, monitors, posts, distributions, and analytics.

**Publication Status:**
- **Active:** Monitors run at configured frequency, full functionality
- **Maintenance:** Monitors run less frequently, vault still accumulates
- **Paused:** Monitors disabled, manual capture only

**What a Publication Contains:**
- **Vault:** Publication-specific assets (filtered view of global vault)
- **Monitors:** Automated research queries for this project
- **Posts:** Content created for this publication
- **Distributions:** Published content on various platforms
- **Analytics:** Performance data specific to this publication

---

### LAYER 3: MONITOR (Automated Research)

**What Monitors Are:**
Automated research queries that watch specific signals and surface relevant content for user curation. Nothing auto-saves - user approves all promotions to vault.

(See the original v3.1 spec message for full monitor type definitions.)

---

### LAYER 4: COMPOSE (Multi-Format Creation)

**The Composition Interface:**
- Rich editor
- Asset drawer (publication-scoped)
- Output format templates per platform

---

### LAYER 5: DISTRIBUTE (Multi-Platform Publishing)

**Distribution Flow:**
- Reviewable, platform-specific formatting
- Post/schedule to connected platforms
- Log distributions and begin engagement tracking

---

### LAYER 6: ANALYZE (Performance Intelligence)

**Analytics Scope:**
- User, publication, post, asset and platform levels
- Asset lineage across posts and distributions

---

## 3. TECHNICAL IMPLEMENTATION

(See the original v3.1 spec message for full database and API route proposals.)
