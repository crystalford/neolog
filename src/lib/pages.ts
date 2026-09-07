/**
 * Pages — the index.
 *
 * "There is one kind of page that gathers entries: a page." An idea, a job, a
 * company, a person, a place, a project — anything the operator would say
 * "the ___ page" about. The kind is a label, not a different page
 * (`headings.html`: "One shape, five kinds").
 *
 * ── The rules, from `subject.html` and SPEC §1 ────────────────────────────
 *
 *   - **One mention makes a page.** Not two, not three — the log does not
 *     make him repeat himself to be taken seriously. From then on it is a
 *     place, whether he ever says another word about it or not.
 *   - **The count describes; it never decides.** It is information on the
 *     page. It never triggers a prompt, and the log never says "you've
 *     mentioned this eleven times."
 *   - **Made once**, the first time the log is sure, with a receipt and one
 *     undo. After that everything attaches — by date, by the word, by the
 *     place — without asking.
 *   - **Named by the log, renamed by him.** The name is the log's first
 *     guess at what he is talking about.
 *   - **The paragraph is the log's**, rewritten as things attach, always his
 *     to edit — and never presented as his words.
 *
 * ── Where the first pages come from ──────────────────────────────────────
 *
 * The extraction passes have been naming entities across 320 vlogs for
 * months: `entities` carries a name, a type, a mention count and first/last
 * dates, and `entity_mentions` carries every place each one came up. The
 * librarian has been naming subjects into `clusters`. That is an index
 * already — it just had no page to live on.
 *
 * `seedPages` turns both into pages, idempotently via `source_ref`. Nothing
 * is invented: a page is made only where a pass already found something.
 */

import { findMany, run, batch as d1Batch } from '@/lib/d1'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

/** One shape, these labels. `mention` is a name that was never made into more. */
export type PageKind =
  | 'job' | 'project' | 'subject' | 'person' | 'place' | 'thing' | 'mention'
  // `term.html` — a word he coined or took over, with the sentence it was
  // coined in and every use since. It is a page like any other; the kind is
  // a label, and what makes it a term is that the FIRST use is the point.
  | 'term'

export const PAGE_KINDS: PageKind[] = [
  'job', 'project', 'subject', 'person', 'place', 'thing', 'term', 'mention',
]

export interface PageRow {
  id: string
  name: string
  kind: PageKind
  summary: string | null
  summary_author: 'log' | 'operator'
  span_start: string | null
  span_end: string | null
  entry_count: number
  visibility: string
  named_by_system: number
  source_ref: string | null
  merged_into: string | null
}

/**
 * The extraction pass's entity types map onto page kinds. `tool` and
 * `reference` become `thing`; `concept` and `theme` become `subject` —
 * both are things he thinks about, which is what a subject is.
 */
export function kindForEntityType(t: string | null): PageKind {
  switch ((t || '').toLowerCase()) {
    case 'person':    return 'person'
    case 'place':     return 'place'
    case 'project':   return 'project'
    case 'tool':
    case 'reference': return 'thing'
    case 'concept':
    case 'theme':     return 'subject'
    default:          return 'subject'
  }
}

/**
 * The status word on the index. Derived, never stored — it is a reading of
 * the dates and the count, so it can never go stale against them.
 *
 * `headings.html` shows: ongoing · from memory · said once · mostly blank.
 */
export function statusFor(p: {
  entry_count: number
  span_start: string | null
  span_end: string | null
}, now = new Date()): string {
  if (p.entry_count <= 1) return 'said once'
  const end = p.span_end ? new Date(p.span_end).getTime() : 0
  const recent = end > 0 && (now.getTime() - end) < 1000 * 60 * 60 * 24 * 120
  if (recent) return 'ongoing'
  const start = p.span_start ? new Date(p.span_start).getTime() : 0
  if (start && end) {
    const years = (end - start) / (1000 * 60 * 60 * 24 * 365)
    if (years >= 1 && p.entry_count < years * 6) return 'mostly blank'
  }
  return 'from memory'
}

/** "2001 – 2008" · "31 Aug 2026 →" · "summer 2003 – 2008" */
export function spanFor(p: { span_start: string | null; span_end: string | null }, now = new Date()): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const thisYear = d.getUTCFullYear() === now.getUTCFullYear()
    return thisYear
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : `${d.getUTCFullYear()}`
  }
  const a = p.span_start ? fmt(p.span_start) : ''
  const b = p.span_end ? fmt(p.span_end) : ''
  if (!a && !b) return ''
  if (a && b && a === b) return a
  // Still going: within the last four months reads as open-ended.
  const end = p.span_end ? new Date(p.span_end).getTime() : 0
  const open = end > 0 && (now.getTime() - end) < 1000 * 60 * 60 * 24 * 120
  if (open) return `${a} →`
  return a && b ? `${a} – ${b}` : (a || b)
}

/**
 * How the index groups. `headings.html` uses four bands, and the ordering
 * inside each is newest activity first.
 */
export type PageBand = 'now' | 'before' | 'people' | 'places'

export function bandFor(p: {
  kind: PageKind
  span_end: string | null
}, now = new Date()): PageBand {
  if (p.kind === 'person' || p.kind === 'mention') return 'people'
  if (p.kind === 'place') return 'places'
  const end = p.span_end ? new Date(p.span_end).getTime() : 0
  const recent = end > 0 && (now.getTime() - end) < 1000 * 60 * 60 * 24 * 365
  return recent ? 'now' : 'before'
}

export const BAND_LABELS: Record<PageBand, { title: string; sub: string }> = {
  now:    { title: 'Going on now', sub: '' },
  before: { title: 'From before',  sub: 'mostly from memory' },
  people: { title: 'People',       sub: '' },
  places: { title: 'Places',       sub: '' },
}

// ── Seeding ───────────────────────────────────────────────────────────────

export interface SeedResult {
  entities_seen: number
  clusters_seen: number
  pages_written: number
  attachments_written: number
  skipped_existing: number
  /** True when the attach hit its cap — press again to continue. */
  more_to_attach: boolean
}

/**
 * Make a page for everything the extraction passes have already named.
 *
 * Idempotent through `source_ref`, so this can be re-run after any new
 * extraction and will add only what is new. Nothing is invented here — a
 * page appears only where a pass already found a name.
 */
export async function seedPages(
  db: D1Database,
  operatorId: string,
  opts: { limit?: number; minMentions?: number } = {},
): Promise<SeedResult> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 300))
  // One mention makes a page. The option exists so the operator can raise
  // the bar himself; it is never raised for him.
  const minMentions = Math.max(1, opts.minMentions ?? 1)

  const [entities, clusters] = await Promise.all([
    findMany<{
      id: string; name: string; entity_type: string | null
      notes: string | null; mention_count: number | null
      first_mentioned_at: string | null; last_mentioned_at: string | null
    }>(
      db,
      `SELECT id, name, entity_type, notes, mention_count,
              first_mentioned_at, last_mentioned_at
         FROM entities
        WHERE operator_id = ? AND deleted_at IS NULL
          AND COALESCE(mention_count, 1) >= ?
          AND TRIM(COALESCE(name,'')) <> ''
        ORDER BY COALESCE(mention_count, 1) DESC
        LIMIT ?`,
      operatorId, minMentions, limit,
    ),
    findMany<{
      id: string; topic: string | null; take: string | null
      framing: string | null; representative_quote: string | null
      created_at: string; updated_at: string
    }>(
      db,
      `SELECT id, topic, take, framing, representative_quote, created_at, updated_at
         FROM clusters
        WHERE operator_id = ? AND deleted_at IS NULL
          AND subject_source = 'librarian'
          AND TRIM(COALESCE(topic,'')) <> ''
        LIMIT ?`,
      operatorId, limit,
    ),
  ])

  const INSERT = `INSERT OR IGNORE INTO pages
    (id, operator_id, name, kind, summary, summary_author, span_start,
     span_end, entry_count, visibility, named_by_system, source_ref)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`

  const statements: { sql: string; binds: unknown[] }[] = []

  for (const e of entities) {
    statements.push({
      sql: INSERT,
      binds: [
        ulid(), operatorId, e.name.trim(), kindForEntityType(e.entity_type),
        // `notes` is the pass's own description. It is the log's, and the
        // column says so.
        e.notes || null, 'log',
        e.first_mentioned_at, e.last_mentioned_at,
        e.mention_count ?? 1, 'public', 1, `entity:${e.id}`,
      ],
    })
  }

  for (const c of clusters) {
    statements.push({
      sql: INSERT,
      binds: [
        ulid(), operatorId, (c.topic || '').trim(), 'subject',
        c.framing || c.take || null, 'log',
        c.created_at, c.updated_at,
        0, 'public', 1, `cluster:${c.id}`,
      ],
    })
  }

  let written = 0
  for (let i = 0; i < statements.length; i += 40) {
    const res = await d1Batch(db, statements.slice(i, i + 40))
    for (const r of res) written += (r as any)?.meta?.changes ?? 0
  }

  // Attach what each entity was mentioned in. `entity_mentions.source_id`
  // points at a thread or a vlog; a relogged entry carries its thread in
  // `source_ref`, so the two join up without a new column.
  const ATTACH_CAP = 4000
  const attachments = await attachFromMentions(db, operatorId, ATTACH_CAP)

  return {
    entities_seen: entities.length,
    clusters_seen: clusters.length,
    pages_written: written,
    attachments_written: attachments,
    skipped_existing: Math.max(0, statements.length - written),
    // INSERT OR IGNORE means a re-run only does what is left, so "press
    // again" is a complete answer rather than a workaround.
    more_to_attach: attachments >= ATTACH_CAP,
  }
}

/**
 * Attach entries to pages using the mentions the extraction pass already
 * recorded. A mention names a thread or a vlog; relog put each thread on
 * the log as an entry carrying `source_ref = 'thread:<id>'`, so a mention
 * resolves to a real row on the feed.
 */
async function attachFromMentions(
  db: D1Database,
  operatorId: string,
  limit = 4000,
): Promise<number> {
  // Bounded. `entity_mentions` across 320 vlogs is tens of thousands of rows,
  // and this join can multiply them — an unbounded version built one INSERT
  // per row and then tried to run them all inside one Worker invocation.
  // Seeding is idempotent and re-runnable, so a cap costs a second press and
  // nothing else; running out of time or memory costs the whole seed.
  const rows = await findMany<{
    page_id: string; entry_kind: string; entry_id: string
  }>(
    db,
    `SELECT p.id AS page_id, 'entry' AS entry_kind, le.id AS entry_id
       FROM entity_mentions em
       JOIN pages p
         ON p.operator_id = em.operator_id
        AND p.source_ref = 'entity:' || em.entity_id
       JOIN log_entries le
         ON le.operator_id = em.operator_id
        AND le.source_ref = 'thread:' || em.source_id
      WHERE em.operator_id = ? AND em.source_kind = 'thread'
        AND p.deleted_at IS NULL AND le.deleted_at IS NULL

      UNION

     SELECT p.id AS page_id, 'vlog' AS entry_kind, v.id AS entry_id
       FROM entity_mentions em
       JOIN pages p
         ON p.operator_id = em.operator_id
        AND p.source_ref = 'entity:' || em.entity_id
       JOIN vlogs v
         ON v.operator_id = em.operator_id AND v.id = em.source_id
      WHERE em.operator_id = ? AND em.source_kind = 'vlog'
        AND p.deleted_at IS NULL AND v.deleted_at IS NULL

      LIMIT ?`,
    operatorId, operatorId, limit,
  )

  if (!rows.length) return 0
  const statements = rows.map(r => ({
    sql: `INSERT OR IGNORE INTO page_entries (page_id, entry_kind, entry_id, attached_by)
          VALUES (?,?,?,'word')`,
    binds: [r.page_id, r.entry_kind, r.entry_id],
  }))

  let written = 0
  for (let i = 0; i < statements.length; i += 40) {
    const res = await d1Batch(db, statements.slice(i, i + 40))
    for (const r of res) written += (r as any)?.meta?.changes ?? 0
  }
  return written
}

/**
 * Recompute each page's count and span from what is actually attached.
 * Derived values go stale; this is the one place that fixes them, and it is
 * cheap enough to run after every seed.
 */
export async function recountPages(db: D1Database, operatorId: string): Promise<number> {
  const res: any = await run(
    db,
    `UPDATE pages
        SET entry_count = (
              SELECT COUNT(*) FROM page_entries pe WHERE pe.page_id = pages.id
            ),
            span_start = COALESCE((
              SELECT MIN(le.happened_at) FROM page_entries pe
                JOIN log_entries le ON le.id = pe.entry_id AND pe.entry_kind = 'entry'
               WHERE pe.page_id = pages.id AND le.deleted_at IS NULL
            ), span_start),
            span_end = COALESCE((
              SELECT MAX(le.happened_at) FROM page_entries pe
                JOIN log_entries le ON le.id = pe.entry_id AND pe.entry_kind = 'entry'
               WHERE pe.page_id = pages.id AND le.deleted_at IS NULL
            ), span_end),
            updated_at = CURRENT_TIMESTAMP
      WHERE operator_id = ? AND deleted_at IS NULL`,
    operatorId,
  )
  return res?.meta?.changes ?? 0
}
