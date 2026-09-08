/**
 * Export — a stretch of the log, as a document.
 *
 * `export.html`, and SPEC §1 under Ownership: "Export is the promise. Any
 * range exports whole — an entry, a page, a span of years, the log — as
 * Markdown + media + a JSON manifest that outlive the software."
 *
 * ── The two rules on the page itself ─────────────────────────────────────
 *
 *   "nothing added that isn't in the log"
 *   "every line traces to an entry · dates marked approximate are approximate"
 *
 * So this file never calls a model, never summarises, and never smooths a
 * fragment into a sentence. It reorders and formats what is already stored,
 * and every line carries its own provenance: when it happened, whether that
 * date was approximate, and who wrote the line.
 *
 * A page's paragraph may appear at the top of a scoped export because it is
 * already in the log and already marked as the log's — it is not written
 * here.
 *
 * ── Why Markdown and JSON, and not a zip ─────────────────────────────────
 *
 * The promise is that the export outlives the software. Markdown opens in
 * anything; the JSON manifest carries every field the renderer dropped, so
 * nothing is lost by reading the pretty version. Media stays in R2 and the
 * manifest points at it — a Worker cannot stream 11 GB of video into a zip,
 * and pretending otherwise would make the promise smaller, not bigger.
 */

import { findMany } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import {
  type DatePrecision, isFuzzy, spokenDuration,
} from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

export interface ExportScope {
  /**
   * One entry and everything that makes it evidence — its thread, its
   * revisions, its dates. SPEC §1: "**Export of one position is a record of
   * origin:** dates, the words, both wordings, who wrote each line, what the
   * software did."
   */
  entryId?: string | null
  /** ISO date, inclusive. */
  from?: string | null
  /** ISO date, inclusive. */
  to?: string | null
  /** Restrict to one page's entries. */
  pageId?: string | null
}

export interface ExportEntry {
  id: string
  text: string
  detail: string | null
  happened_at: string
  logged_at: string
  date_precision: DatePrecision
  kind: string
  visibility: string
  author: string
  source_kind: string
  source_ref: string | null
  vlog_id: string | null
  transcript: string | null
  link_url: string | null
  original_filename: string | null
  duration_seconds: number | null
  media_url: string | null
}

export interface ExportBundle {
  title: string
  operator: string
  exported_at: string
  scope: ExportScope
  page: { id: string; name: string; kind: string; summary: string | null; summary_author: string } | null
  entries: ExportEntry[]
  /** Every correction, with both wordings. Only on a record of origin. */
  revisions?: { entry_id: string; field: string; old_value: string | null; new_value: string | null; created_at: string }[]
  counts: {
    entries: number; approximate_dates: number; log_written: number
    /**
     * How many entries the range actually HOLDS, which is not always how
     * many are in this file.
     */
    matched: number
    /** True when `matched` is more than this export could carry. */
    truncated: boolean
  }
}

/**
 * The most entries one export carries. An edge Worker builds the whole
 * document in memory, so this is a real ceiling rather than a preference —
 * which is exactly why the file has to say when it hits it.
 */
export const MAX_EXPORT_ENTRIES = 5000

interface Env extends R2Env { DB: D1Database }

/**
 * Collect everything the log has for a range, in the order it happened.
 * Buried entries are excluded — they are out of the feed, search and counts,
 * and an export is a reading of the log, not a dump of the table.
 */
export async function buildExport(
  env: Env,
  db: D1Database,
  operatorId: string,
  operatorName: string,
  scope: ExportScope,
): Promise<ExportBundle> {
  const where: string[] = [
    'le.operator_id = ?',
    'le.deleted_at IS NULL',
    'le.buried_at IS NULL',
  ]
  const binds: unknown[] = [operatorId]

  if (scope.from) {
    where.push('COALESCE(le.happened_at, le.occurred_at) >= ?')
    binds.push(new Date(scope.from).toISOString())
  }
  if (scope.to) {
    // Inclusive of the whole final day.
    const end = new Date(scope.to)
    end.setUTCHours(23, 59, 59, 999)
    where.push('COALESCE(le.happened_at, le.occurred_at) <= ?')
    binds.push(end.toISOString())
  }

  // A record of origin: one entry, the turns either side of it, and the
  // reflections attached to it. Not a range — a road.
  if (scope.entryId) {
    return buildRecordOfOrigin(env, db, operatorId, operatorName, scope.entryId)
  }

  const join = scope.pageId
    ? 'JOIN page_entries pe ON pe.entry_id = le.id AND pe.entry_kind = \'entry\' AND pe.page_id = ?'
    : ''
  if (scope.pageId) binds.unshift(scope.pageId)

  const rows = await findMany<ExportEntry & { r2_key: string | null; occurred_at: string; created_at: string }>(
    db,
    `SELECT le.id, le.text, le.detail,
            COALESCE(le.happened_at, le.occurred_at, le.created_at) AS happened_at,
            COALESCE(le.logged_at, le.created_at) AS logged_at,
            le.date_precision, le.kind, le.visibility, le.author, le.source_kind,
            le.source_ref, le.vlog_id, le.transcript, le.link_url,
            le.original_filename, le.duration_seconds, le.r2_key,
            le.occurred_at, le.created_at
       FROM log_entries le
       ${join}
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(le.happened_at, le.occurred_at) ASC
      LIMIT ${MAX_EXPORT_ENTRIES}`,
    ...binds,
  )

  // ⚠️ How many the range HOLDS, so a truncated export can say so.
  //
  // The cap has always been here and it was silent. An export is the one
  // artefact a person keeps and trusts on its own, away from the log — and
  // this product's whole claim is that nothing is added and nothing is
  // quietly changed. **Dropping entries without saying so is the same lie by
  // omission**, and the more of a life is in the log the more certain it
  // becomes. `check-design.mjs`'s own rule applies here too: no silent caps.
  const total = await findMany<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n
       FROM log_entries le
       ${join}
      WHERE ${where.join(' AND ')}`,
    ...binds,
  )
  const matched = Number(total[0]?.n ?? rows.length)

  // Media stays where it is; the manifest points at it.
  const entries: ExportEntry[] = await Promise.all(rows.map(async r => {
    let media_url: string | null = null
    if (r.r2_key) {
      try { media_url = await presignGetUrl(env, r.r2_key, 24 * 3600) } catch { media_url = null }
    }
    const { r2_key, occurred_at, created_at, ...rest } = r as any
    return { ...rest, media_url } as ExportEntry
  }))

  let page: ExportBundle['page'] = null
  if (scope.pageId) {
    const p = await findMany<{ id: string; name: string; kind: string; summary: string | null; summary_author: string }>(
      db,
      `SELECT id, name, kind, summary, summary_author FROM pages
        WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      scope.pageId, operatorId,
    )
    page = p[0] || null
  }

  const title = page ? page.name : 'The log'

  return {
    title,
    operator: operatorName,
    exported_at: new Date().toISOString(),
    scope,
    page,
    entries,
    counts: {
      entries: entries.length,
      matched,
      truncated: matched > entries.length,
      approximate_dates: entries.filter(e => isFuzzy(e.date_precision)).length,
      log_written: entries.filter(e => e.author === 'log').length,
    },
  }
}

/**
 * A record of origin — one position, as it actually happened.
 *
 * `proof.html`: "A finished essay no longer proves anyone thought it. The
 * road to it does — and the log already keeps the road... You can fake an
 * essay. You can't fake three months of a thought coming back to you — that
 * takes living three months."
 *
 * So this exports the road: the entry, the turn it came out of, the turns it
 * led to, the later thoughts attached to it, and every correction with both
 * wordings — each dated, each saying who wrote it.
 */
async function buildRecordOfOrigin(
  env: Env,
  db: D1Database,
  operatorId: string,
  operatorName: string,
  entryId: string,
): Promise<ExportBundle> {
  const SELECT = `SELECT le.id, le.text, le.detail,
            COALESCE(le.happened_at, le.occurred_at, le.created_at) AS happened_at,
            COALESCE(le.logged_at, le.created_at) AS logged_at,
            le.date_precision, le.kind, le.visibility, le.author, le.source_kind,
            le.source_ref, le.vlog_id, le.transcript, le.link_url,
            le.original_filename, le.duration_seconds, le.r2_key,
            le.occurred_at, le.created_at, le.led_from, le.relation
       FROM log_entries le`

  const rows = await findMany<ExportEntry & {
    r2_key: string | null; occurred_at: string; created_at: string
    led_from: string | null; relation: string
  }>(
    db,
    `${SELECT}
      WHERE le.operator_id = ? AND le.deleted_at IS NULL
        AND (
          le.id = ?
          OR le.led_from = ?
          OR le.id = (SELECT led_from FROM log_entries WHERE id = ? AND operator_id = ?)
        )
      ORDER BY COALESCE(le.happened_at, le.occurred_at) ASC`,
    operatorId, entryId, entryId, entryId, operatorId,
  )

  const entries: ExportEntry[] = await Promise.all(rows.map(async r => {
    let media_url: string | null = null
    if (r.r2_key) {
      try { media_url = await presignGetUrl(env, r.r2_key, 24 * 3600) } catch {}
    }
    const { r2_key, occurred_at, created_at, led_from, relation, ...rest } = r as any
    return { ...rest, media_url } as ExportEntry
  }))

  // Both wordings of anything corrected — that is the part a finished piece
  // cannot show.
  const revisions = await findMany<{
    entry_id: string; field: string; old_value: string | null
    new_value: string | null; created_at: string
  }>(
    db,
    `SELECT entry_id, field, old_value, new_value, created_at
       FROM entry_revisions
      WHERE operator_id = ? AND entry_id IN (${rows.map(() => '?').join(',') || "''"})
      ORDER BY created_at ASC`,
    operatorId, ...rows.map(r => r.id),
  )

  const subject = rows.find(r => r.id === entryId)

  return {
    title: subject ? firstSentence(subject.text) : 'A record of origin',
    operator: operatorName,
    exported_at: new Date().toISOString(),
    scope: { entryId },
    page: null,
    entries,
    revisions,
    counts: {
      entries: entries.length,
      // A record of origin is one entry's road. It is never truncated —
      // what it gathers is the whole of what it set out to gather.
      matched: entries.length,
      truncated: false,
      approximate_dates: entries.filter(e => isFuzzy(e.date_precision)).length,
      log_written: entries.filter(e => e.author === 'log').length,
    },
  }
}

function firstSentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ')
  const stop = t.search(/[.!?](\s|$)/)
  const cut = stop > 0 ? t.slice(0, stop) : t
  return cut.length > 80 ? `${cut.slice(0, 78)}…` : cut
}

// ── Rendering ─────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** The line under an entry that says where it came from. Never invented. */
function provenance(e: ExportEntry): string {
  const bits: string[] = []

  if (e.author === 'operator') bits.push('you said it')
  else if (e.author === 'log') bits.push('the log wrote this line')
  else bits.push('the log drafted it, you edited it')

  if (e.source_kind === 'vlog' || e.source_ref?.startsWith('thread:')) {
    bits.push('said out loud, in a recording')
  } else if (e.source_kind === 'voice') {
    const d = spokenDuration(e.duration_seconds)
    bits.push(d ? `talked into the box · ${d}` : 'talked into the box')
  } else if (e.source_kind === 'file') {
    bits.push(e.original_filename ? `from a file · ${e.original_filename}` : 'from a file')
  } else if (e.source_kind === 'link') {
    bits.push('a link, pasted')
  }

  if (isFuzzy(e.date_precision)) bits.push('this date is approximate')
  if (e.visibility === 'private') bits.push('kept private')
  if (e.visibility === 'held') bits.push('held back by the log')

  const logged = new Date(e.logged_at)
  const happened = new Date(e.happened_at)
  if (!isNaN(logged.getTime()) && !isNaN(happened.getTime())) {
    const days = Math.round((logged.getTime() - happened.getTime()) / 86400000)
    if (days >= 2) bits.push(`written down ${days} days later`)
  }

  return bits.join(' · ')
}

function stamp(iso: string, precision: DatePrecision): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'undated'
  if (precision === 'year') return `${d.getUTCFullYear()}`
  if (precision === 'month') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
  if (precision === 'approx') return `~${day}`
  return day
}

/**
 * The export as a document. Grouped by year, then month, the way the design
 * shows it — headings are the dates themselves, because a date is the only
 * heading the log can write without inventing something.
 */
export function renderMarkdown(b: ExportBundle): string {
  const out: string[] = []
  const exported = new Date(b.exported_at)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  out.push(`# ${b.title}`)
  out.push('')
  out.push(`${b.operator} · from the log`)
  out.push('')
  out.push(`Exported ${exported}. Every line traces to an entry. Dates marked approximate are approximate. Nothing here was added that isn't in the log.`)
  out.push('')

  const range: string[] = []
  if (b.scope.from) range.push(`from ${b.scope.from}`)
  if (b.scope.to) range.push(`to ${b.scope.to}`)
  if (range.length) { out.push(`Range: ${range.join(' ')}`); out.push('') }

  out.push(`${b.counts.entries} ${b.counts.entries === 1 ? 'entry' : 'entries'}. ${b.counts.approximate_dates} carry an approximate date. ${b.counts.log_written} of the lines were written by the log rather than by ${b.operator}.`)
  // ⚠️ Said in the FILE, not only on the screen that made it. An export is
  // kept and read on its own, long after the page that produced it is gone;
  // a document that quietly holds less than it claims is the one failure
  // this product cannot afford.
  if (b.counts.truncated) {
    out.push('')
    out.push(
      `**This is not all of it.** The range holds ${b.counts.matched.toLocaleString('en-GB')} `
      + `entries and this file carries the first ${b.counts.entries.toLocaleString('en-GB')}, `
      + 'oldest first. Narrow the range and export again for the rest — nothing '
      + 'has been left out of the log, only out of this file.',
    )
  }
  out.push('')

  if (b.scope.entryId) {
    out.push('This is a record of origin: one position as it actually happened, with the entries either side of it and every wording it has had. A finished piece proves nobody thought it; the road to it does.')
    out.push('')
  }

  if (b.page?.summary) {
    out.push('---')
    out.push('')
    out.push(b.page.summary)
    out.push('')
    out.push(b.page.summary_author === 'operator'
      ? '*Your words.*'
      : "*The log's one-paragraph version, from the entries below.*")
    out.push('')
  }

  out.push('---')
  out.push('')

  let year = ''
  let month = ''
  for (const e of b.entries) {
    const d = new Date(e.happened_at)
    const y = isNaN(d.getTime()) ? 'Undated' : `${d.getUTCFullYear()}`
    const m = isNaN(d.getTime()) ? '' : MONTHS[d.getUTCMonth()]

    if (y !== year) { out.push(`## ${y}`); out.push(''); year = y; month = '' }
    // A year-precision entry has no real month, so it gets no month heading.
    if (m && m !== month && e.date_precision !== 'year') {
      out.push(`### ${m} ${y}`); out.push(''); month = m
    }

    out.push(`**${stamp(e.happened_at, e.date_precision)}** — ${e.text.trim()}`)
    out.push('')
    if (e.detail) { out.push(e.detail.trim()); out.push('') }
    if (e.link_url) { out.push(`<${e.link_url}>`); out.push('') }
    if (e.media_url) {
      out.push(`[${e.original_filename || 'the file'}](${e.media_url})`)
      out.push('')
    }
    if (e.transcript && e.transcript.trim() !== e.text.trim()) {
      out.push('> ' + e.transcript.trim().split('\n').join('\n> '))
      out.push('')
    }
    out.push(`*${provenance(e)} · entry ${e.id}*`)
    out.push('')
  }

  if (b.revisions && b.revisions.length) {
    out.push('---')
    out.push('')
    out.push('## What changed, and when')
    out.push('')
    out.push('Both wordings are kept. This is the part a finished piece cannot show.')
    out.push('')
    for (const r of b.revisions) {
      out.push(`**${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}** — ${r.field}`)
      out.push('')
      if (r.old_value) { out.push(`> was: ${r.old_value}`); out.push('') }
      if (r.new_value) { out.push(`> became: ${r.new_value}`); out.push('') }
    }
  }

  out.push('---')
  out.push('')
  out.push(`Exported from neolog on ${exported}. The JSON manifest beside this file carries every field this document does not show.`)
  out.push('')
  return out.join('\n')
}
