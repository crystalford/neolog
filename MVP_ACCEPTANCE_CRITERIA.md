# Neolog — MVP Acceptance Criteria (Reality-Checked)

Date: 2026-01-05

This is a checklist you can use to decide whether “V1 is real”. It is intentionally concrete and testable.

---

## 1) INGEST (Provenance-First)

### Manual ingest
- A logged-in user can create an inbox item from the UI (title/url/raw payload).
- Every created inbox item has provenance fields populated (`source_type`, and at least one of `source_url` / `canonical_url` / `raw_data`).

### RSS ingest
- A logged-in user can add an RSS/Atom source.
- Cron pull creates inbox items reliably and does not fail the whole batch on one bad item.
- Duplicate/slug collisions do not break ingestion (dedupe strategy may be minimal, but failures are partial not total).

### Webhook ingest (“Drop Box”)
- A script can POST an API-key authenticated payload to create an inbox artifact.
- The payload supports `title`, `content`, `content_type`, `tags`, `source_tool`, and provenance fields.
- The system stores the full inbound payload (or a normalized version) inside `raw_data` without discarding provenance.

---

## 2) CORE (Inbox → Drafts)

### Triage
- Inbox supports: status filter, source filter, date filter.
- A user can mark items as imported or ignored.

### Draft creation
- Converting a single inbox item creates a `posts` row in `draft` status.
- Bulk conversion converts N selected items with one action and gives partial-failure behavior.
- Slug collisions are handled (retry slug variants) instead of failing the conversion.
- Converted inbox items are marked `imported`.

---

## 3) PUBLISH (Fast)
- First publish feels instant (fast path updates state quickly).
- Heavy side effects run asynchronously and do not block the publish response.

---

## 4) BROADCAST (Reviewable Assets)
- A published post can generate a distribution pack.
- The pack can be refreshed and errors are visible to the user.
- Generated assets are stored and re-loadable (no “only in memory” behavior).

---

## 5) INTEROPERABILITY (Read)
- `/llms.txt` exists and returns a stable machine-readable format.
- `/[username]/llms.txt` exists and returns that user’s content.

---

## 6) NON-GOALS (Explicitly Out of V1)
- Full “knowledge graph” (entity/edge modeling, graph queries)
- Autonomous agents without an observable job substrate
- X/Twitter list monitoring without official API access
- Auto-posting to social platforms by default (unless consent + reliability UX exists)
- Fully automatic Git commit backup (export bundle is fine)
