# Phase 1 — operator runbook

This document is the operator-side checklist for completing Phase 1 of the filament-update integration. The Claude-side work for Phase 1 is done (see commits on `claude/integrate-filament-update-XWb1v`); this runbook covers the steps that require operator credentials, a running app, or external services.

Tick each item before starting Phase 2 (the schema migration).

---

## ☐ 1. Push the `pre-rebuild` git tag to the remote

The tag is set locally at the commit before the reconciliation report (`7d6713a`). Tag-push from the Claude-side session was blocked with HTTP 403 — likely a tag-permission rule on the remote. Run from your machine:

```bash
git fetch origin claude/integrate-filament-update-XWb1v
git push origin pre-rebuild
```

If push still fails, check the GitHub repo settings → Tag protection rules. Either temporarily relax, or create the tag via the GitHub UI at commit `7d6713a`.

---

## ☐ 2. Take the pre-rebuild `pg_dump` backup

Snapshot the live Supabase database before Phase 2 makes schema changes. Two paths:

**Option A — Supabase dashboard (easiest):**
- Supabase → Project → Database → Backups → Download a fresh manual backup. Save locally as `pre-rebuild-2026-05-02.sql.gz`.

**Option B — CLI (cleanest, scriptable):**
```bash
# from a machine with psql + pg_dump and network access to Supabase
PGPASSWORD=$SUPABASE_DB_PASSWORD pg_dump \
  --host=db.<project-ref>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --no-owner --no-privileges \
  --schema=public --schema=auth \
  | gzip > pre-rebuild-2026-05-02.sql.gz
```

**Then upload to R2:**
```bash
# adjust bucket name to match your existing R2 bucket
wrangler r2 object put <vlog-bucket>/backups/pre-rebuild-2026-05-02.sql.gz \
  --file pre-rebuild-2026-05-02.sql.gz
```

If you don't have a `backups/` prefix yet in the bucket, this command creates it.

---

## ☐ 3. Confirm Supabase point-in-time recovery (PITR) is on

Supabase → Project → Settings → Database → Point in Time Recovery. Confirm the retention window (default 7 days on Pro, 14 days on higher tiers). PITR plus the manual `pg_dump` give us two independent rollback paths.

---

## ☐ 4. Capture `before/` screenshots of every current dashboard page

Visual A/B reference for the page-by-page palette migration in Phases 5–7.

**Manual approach (recommended — pages have data only the operator can see):**

1. Boot the app locally: `pnpm dev`
2. Sign in as yourself
3. For each page below, full-window screenshot (cmd-shift-4 then space-bar on macOS), save to `docs/before/<page-name>.png`:
   - `/dashboard` → `home.png`
   - `/dashboard/timeline` → `timeline.png`
   - `/dashboard/timeline/<some-session-id>` → `timeline-detail.png`
   - `/dashboard/videos` → `videos.png`
   - `/dashboard/posts` → `posts.png`
   - `/dashboard/studio` → `studio.png`
   - `/dashboard/edit` → `edit.png`
   - `/dashboard/brain` → `brain.png`
   - `/dashboard/entities/<some-entity-id>` → `entity-detail.png`
   - `/dashboard/settings` → `settings.png`
   - `/dashboard/system` → `system.png`
   - `/dashboard/projects` → `projects.png`
   - `/dashboard/character` → `character.png`
   - `/dashboard/profile` → `profile.png`
   - `/dashboard/synthesis` → `synthesis.png`
4. Commit the folder: `git add docs/before/ && git commit -m "Add pre-rebuild screenshots"`

If you want me to automate this with a headless browser, say so — there's a small Playwright script I can write that loops the routes, but you'd need to provide a valid session cookie.

---

## ☐ 5. Run the thumbnail + recorded_at smoke test (baseline)

Establishes the green baseline. Future PRs run this same script and must keep it green.

```bash
pnpm node scripts/smoke-thumbnails.mjs
```

Default mode checks the last 20 processed uploads. Should print 20 ✅ rows and end with `PASS`. If anything fails, the locked pipeline is already broken — investigate before touching anything else.

For the more rigorous fixture mode, pick four representative uploads in your library and write `scripts/fixtures/thumbnail-fixtures.json`:

```json
[
  { "id": "<uuid>", "label": "DJI HEVC vertical", "expected_source": "mvhd" },
  { "id": "<uuid>", "label": "iPhone HEVC", "expected_source": "mvhd" },
  { "id": "<uuid>", "label": "MP4 with mvhd", "expected_source": "mvhd" },
  { "id": "<uuid>", "label": "MP4 without mvhd", "expected_source": "filename" }
]
```

Then:
```bash
pnpm node scripts/smoke-thumbnails.mjs --fixtures scripts/fixtures/thumbnail-fixtures.json
```

---

## ☐ 6. Set the `NEXT_PUBLIC_NEOLOG_V2` feature flag

Add to `.env.local` (and to the Cloudflare Pages env vars when v2 surfaces start shipping):

```
NEXT_PUBLIC_NEOLOG_V2=false
```

Leave it `false` until Phase 5 ships Timeline v2. The v2 routes won't exist yet anyway — this is just registering the flag so the runtime check is in place when v2 surfaces start landing.

---

## ☐ 7. Confirm before unblocking Phase 2

When all items above are ticked:
- `pre-rebuild` tag visible on origin
- `pg_dump` archived in R2 at `backups/pre-rebuild-2026-05-02.sql.gz`
- PITR confirmed on
- `docs/before/` folder populated and committed
- `pnpm node scripts/smoke-thumbnails.mjs` passes
- `NEXT_PUBLIC_NEOLOG_V2=false` set in `.env.local`

…reply "Phase 1 done" and I start Phase 2 (the single all-or-nothing schema migration).

---

## What Phase 1 Claude-side delivered (for your review)

Files added on this branch:

- `CLAUDE.md` — replaced top-to-bottom with new rules doc. Locked thumbnail + backdating warnings carried forward verbatim. New rules cover bone/ink/Geist palette, three-pass extraction, Operator default voice, Lo-Fi tier, freeze-don't-delete data, v2 transition naming, conservative auto-link, no gold set / iterate-on-incoming.
- `docs/RECONCILIATION.md` — Phase 0 reconciliation report (already in your prior review).
- `docs/inngest-events.md` — full inventory of legacy + net-new event names. No reuse.
- `src/lib/design.ts` — INK / BONE / TOPIC / STATE color objects, FONT_BODY / FONT_MONO, body + mono-label defaults, deterministic `topicColorFor(seed)` picker.
- `src/app/globals.css` — Geist font added to the existing `@import url(...)`. Existing amber + Syne setup untouched (legacy pages keep working).
- `supabase/policies/standard-owner-policy.sql` — four variants (direct operator_id, direct user_id, indirect via parent, public-readable layer). One pattern, zero variation.
- `scripts/smoke-rls.mjs` — RLS leak smoke test. Usage: `pnpm node scripts/smoke-rls.mjs <table> [owner_col]`.
- `scripts/smoke-thumbnails.mjs` — thumbnail + recorded_at regression check. Usage above.

No changes to `process-upload.ts`, `backfill-recorded-at.ts`, `lib/ai-provider.ts`, X OAuth/publish routes, or any locked migration. The `_archived/` directories are untouched.

No new feature surfaces yet — Phase 1 is pure infrastructure under the existing app.
