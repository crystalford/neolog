# Neolog Streamlining Plan

## Goal
Transform Neolog back into a streamlined, kickass blogging platform by removing feature creep and focusing on core functionality.

---

## Phase 1: Remove Pulse Feature
**What**: Remove the multi-perspective social curation feature entirely

**Actions**:
- Remove Pulse API endpoints (`/api/pulse/*`)
- Remove Pulse content type from posts
- Remove PulseEditor component
- Remove Pulse database tables/columns
- Remove Pulse from Write page options
- Clean up `post_distribution_packs` references to Pulse

**Files to modify**:
- `/src/app/api/pulse/` (delete entire directory)
- `/src/lib/pulse.ts` (delete)
- `/src/types/database.types.ts` (remove pulse content_type)
- `/src/app/dashboard/write/` (remove pulse editor option)
- Database migration to drop pulse-related columns

---

## Phase 2: Vault → Capture (Rename & Fix)
**What**: Rename Vault to Capture and make it actually functional

**Actions**:
- Rename all "vault" references to "capture" throughout codebase
- Fix "Save to Capture" functionality (currently broken)
- Create proper `/dashboard/captures` list view (currently missing)
- Simplify asset types if needed (currently 7 types: text, fragment, quote, prompt, code, link, image)
- Add quick capture button/modal accessible from anywhere
- Make capture interface clean and intuitive

**Files to modify**:
- `/src/app/dashboard/vault/` → `/src/app/dashboard/captures/`
- `/src/app/api/vault/` → `/src/app/api/captures/`
- All component references to "vault"
- Database: `assets` table stays same (just UI references change)
- Sidebar navigation already shows "Captures"

---

## Phase 3: Restore Hidden Dashboard Features
**What**: Bring back essential features that were hidden

**Features to restore**:
- ✅ Settings (currently hidden)
- ✅ Analytics (per-post analytics)
- ✅ Publications (multi-blog management)
- ✅ Series/Stacks (grouping posts)
- ✅ Topics/Tags management
- ✅ Subscription Tiers

**Implementation**:
- Add these to sidebar navigation (organized in sections)
- Ensure all routes/pages are functional
- Test each feature works properly

**Navigation structure**:
```
CREATE
- Home
- Write
- Captures

MANAGE
- Published
- Analytics
- Series
- Topics

GROW
- Publications
- Tiers
- Import

SETTINGS
- Settings
```

---

## Phase 4: Archive Experimental Features
**What**: Remove or archive features that add complexity without value

**Features to archive/remove**:
- ❌ Boost marketplace (too complex for v1)
- ❌ Referral programs (premature optimization)
- ❌ Monitors (unclear purpose)
- ❌ Syndication (can add back later if needed)
- ❌ Advanced dashboard pages (`/dashboard/dashboard/`)
- ❌ Sources/RSS feed aggregation (different from Import)
- ❌ Saved/History (can add back later)
- ❌ Video briefs (experimental)
- ❌ Deepgram/Gemini ingest (too experimental)

**Implementation**:
- Comment out or remove routes
- Add database migrations to archive tables (don't drop, just in case)
- Remove from navigation
- Keep code in git history for future reference

---

## Phase 5: Simplify Social Sharing
**What**: Replace complex Pulse system with simple Substack-style social sharing

**Current state**:
- Distribution packs generate X threads, LinkedIn posts, Reddit titles
- Too automated, not flexible

**New approach**:
- Simple "Share" button on published posts
- Generates clean preview cards (image + title + excerpt)
- Support formats: Twitter/X, LinkedIn, Facebook, Image (for Instagram/etc)
- Let user copy/customize before sharing
- No auto-posting (keep it simple)

**Implementation**:
- Keep `/api/distribution/generate` but simplify output
- Create simple ShareModal component
- Generate clean OG images for posts
- Add copy-to-clipboard for different formats

---

## Success Metrics
After this streamlining:
- ✅ Capture feature is useful and functional
- ✅ No confusing "Pulse" feature
- ✅ Essential features visible in dashboard
- ✅ Social sharing is simple and works
- ✅ Codebase is cleaner and easier to maintain
- ✅ Platform is clearly a blogging platform, not a confusing multi-tool

---

## Future: Neolog Solo Fork
After this version is stable, create stripped-down PHP version for CodeCanyon:
- Single-user, single-publication
- Core blogging only (posts, tags, simple analytics)
- No subscriptions, no monetization
- Elegant, fast, sellable
