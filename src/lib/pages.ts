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
 * ── Where a page comes from ──────────────────────────────────────────────
 *
 * He names it. That is the whole of it.
 *
 * Pages used to be seeded from `entities` and the librarian's `clusters` — a
 * model's list of the names it thought mattered across three hundred
 * recordings. Both tables went with the extraction engine, and nothing
 * replaced them on purpose: a page the log invented is the log deciding what
 * is significant in his life, which §0 rule 2 and rule 3 forbid between them.
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
/**
 * ── Seeding is gone, and that is the product ─────────────────────────────
 *
 * A page used to be made automatically from `entities` and the librarian's
 * `clusters` — a model's list of the names it thought mattered in three
 * hundred recordings. Both tables went with the extraction engine on 8 Sep,
 * and nothing replaced them, because nothing should: a page the log invented
 * is the log deciding what is significant in his life, which is §0 rule 2 and
 * rule 3 at once.
 *
 * A page is made when he names something. `POST /api/v2/pages` takes a name;
 * everything after attaches by that name appearing in an entry.
 */


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
