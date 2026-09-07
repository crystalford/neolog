/**
 * The entry — the one shape everything in the log takes.
 *
 * ── Settling the handoff's open question #1 ────────────────────────────────
 *
 * HANDOFF.md leaves one thing to "Claude Code decides, after reading what
 * `vlogs` and `threads` actually contain": does the log read the old `vlogs`
 * table directly, or do those rows become `log_entries`?
 *
 * **Decided: the log reads them where they live. There is no import.**
 *
 * The argument, from what the tables actually hold:
 *
 *  - `vlogs` carries twenty-odd columns no entry row could hold without
 *    losing them — `transcript`, `thumbnail_r2_key`, `duration_seconds`,
 *    `extraction_outcomes`, `recorded_at_source`, `is_podcast`. Copying a
 *    vlog into `log_entries` either drops those or duplicates the table.
 *    Both are worse than reading it.
 *  - `recorded_at` and `created_at` ARE the two times. A vlog already knows
 *    when it happened and when it arrived; it does not need to be told.
 *    Same for `photos.taken_at` / `created_at`. The two-times model the
 *    design needs is already satisfied by the existing columns.
 *  - An import is a one-way door that has to be re-run every time a vlog is
 *    uploaded, and goes stale the moment a title or summary changes.
 *
 * This does NOT violate SPEC §0.1 ("never author a second feed"). §0.1
 * forbids two *authored* feeds — two hand-written lists of entries that can
 * disagree. It requires one feed, one entry shape, one shell. That is
 * exactly what this file provides: three tables, one normaliser, one feed.
 * The log is a view over everything the operator has put in, and which
 * table a row sleeps in is storage, not product.
 *
 * ── The rules this file enforces ──────────────────────────────────────────
 *
 * SPEC §1, "Every line stands alone, and is a sentence": a row's `sentence`
 * has a subject doing something. Never a bare filename, never a headline.
 * `DJI_20260401110554_0055_D.MP4` is not a sentence; "Recorded 22 minutes of
 * video." is.
 *
 * SPEC §1, who wrote each line: `author` is set when the line is made and
 * travels with the entry. A line the log composed from a file's metadata is
 * marked `log`, always — including the ones that read naturally.
 *
 * SPEC §0.2, three states and only two are marked: `public` is unmarked,
 * `private` is the operator's call, `held` is the log's.
 */

/** The seven kinds on the log (SPEC §1 — necessity before schema). */
export type EntryKind =
  | 'happened'   // a thing that occurred
  | 'said'       // the operator said it — typed, spoken, quoted
  | 'seen'       // a photo, a screenshot, something looked at
  | 'made'       // a document, a video, a repository — a made thing
  | 'read'       // arrived from outside: a paper, a link, a conversation
  | 'paperwork'  // a receipt, a licence, a statement
  | 'ideas'      // a thought with no event behind it

export const ENTRY_KINDS: EntryKind[] = [
  'happened', 'said', 'seen', 'made', 'read', 'paperwork', 'ideas',
]

/**
 * How precisely the entry is dated. Not a separate schema — one enum on the
 * row, which is what the brief asked for: "is there a lightweight way to
 * capture 'just 2008' without inventing a whole precision field".
 *
 * `happened_at` is always a real timestamp so ordering never breaks; the
 * precision says how much of it to believe and how to render it.
 */
export type DatePrecision = 'exact' | 'day' | 'month' | 'year' | 'approx'

/** Public unmarked · private by the operator · held back by the log. */
export type Visibility = 'public' | 'private' | 'held'

/** you said it · the log wrote it · the log drafted it, you edited it. */
export type Author = 'operator' | 'log' | 'drafted'

export interface MediaRef {
  kind: 'image' | 'video' | 'audio' | 'file'
  url: string | null
  poster_url?: string | null
  duration_seconds?: number | null
  label?: string | null
}

export interface LogEntry {
  id: string
  /** Which table this row lives in. Storage detail; the feed does not care. */
  source: 'entry' | 'vlog' | 'photo'
  kind: EntryKind
  /** One line, a real sentence, standing on its own. */
  sentence: string
  /** The context under the line. May be the log's, in which case author says so. */
  detail: string | null
  happened_at: string
  logged_at: string
  date_precision: DatePrecision
  visibility: Visibility
  /** What the log saw, when it held something back. Never an unnamed reason. */
  held_reason: string | null
  author: Author
  href: string
  media: MediaRef[]
  duration_seconds: number | null
  batch_id: string | null
  /** The recording this came out of, when relog placed it there. */
  vlog_id: string | null
  /** 'thread:<id>' when relog wrote this row; null when the operator did. */
  source_ref: string | null
  /** Free-text the search filter reads — includes transcripts the row doesn't show. */
  searchable: string
}

// ── Sentences ──────────────────────────────────────────────────────────────
// Every one of these has an actor and a verb. They are the log's own lines,
// so every entry built with them carries author='log'.

/** "22 minutes" · "4:12" · "under a minute" — for use inside a sentence. */
export function spokenDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  const mins = Math.round(seconds / 60)
  if (mins < 1) return 'under a minute'
  if (mins === 1) return 'a minute'
  if (mins < 90) return `${mins} minutes`
  const hours = Math.round(seconds / 3600)
  return hours === 1 ? 'an hour' : `${hours} hours`
}

/** "4:12" — for a badge on a thumbnail, not for inside a sentence. */
export function clockDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return `${m}:${String(r).padStart(2, '0')}`
  const h = Math.floor(m / 60)
  return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/**
 * The sentence for a recording. A filename is not a sentence, and neither is
 * a title the extraction pass invented — so the length goes in the line and
 * anything the operator actually titled it goes underneath.
 */
export function vlogSentence(durationSeconds: number | null): string {
  const d = spokenDuration(durationSeconds)
  return d ? `Recorded ${d} of video.` : 'Recorded a video.'
}

export function photoSentence(count = 1): string {
  return count === 1 ? 'Took a photo.' : `Added ${count} photos.`
}

/**
 * The sentence for the act of putting things in — itself an entry, dated
 * `logged_at`, with the manifest behind it (SPEC §1).
 */
export function batchSentence(fileCount: number): string {
  if (fileCount === 1) return 'Put one file in.'
  return `Put ${fileCount} files in.`
}

// ── Dates ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Render a date at the precision it is actually known to. A year-precision
 * entry reads "~2024", never "1 January 2024" — the log does not supply a
 * day it was never told (SPEC §0 principle 3).
 */
export function stampFor(iso: string, precision: DatePrecision): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const year = d.getUTCFullYear()
  switch (precision) {
    case 'year':
      return `~${year}`
    case 'month':
      return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${year}`
    case 'approx':
      return `~${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
    default:
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
  }
}

/** True when the precision means "don't trust the day part". */
export function isFuzzy(precision: DatePrecision): boolean {
  return precision === 'year' || precision === 'month' || precision === 'approx'
}

/** The day heading a row groups under, at the precision it's known to. */
export function dayKeyFor(iso: string, precision: DatePrecision): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'unknown'
  if (precision === 'year') return `${d.getUTCFullYear()}`
  if (precision === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return d.toISOString().slice(0, 10)
}

/**
 * The heading a group of rows sits under. Today and Yesterday are named;
 * everything else is dated. A year-precision group says so.
 */
export function dayHeadingFor(key: string, now = new Date()): { title: string; sub: string } {
  if (key === 'unknown') return { title: 'Undated', sub: 'no clock on these' }
  if (/^\d{4}$/.test(key)) return { title: key, sub: 'year only' }
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-')
    return { title: `${MONTHS[parseInt(m, 10) - 1]} ${y}`, sub: 'month only' }
  }
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const d = new Date(key + 'T00:00:00Z')
  const full = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  if (key === today) return { title: 'Today', sub: full }
  if (key === yesterday) return { title: 'Yesterday', sub: full }
  return { title: full, sub: '' }
}

// ── Filters ────────────────────────────────────────────────────────────────
// The toolbar's eight buttons, mapped onto the entry model. These are reading
// filters over one feed — never separate queries producing separate lists.

export type FeedFilter =
  | 'all' | 'said' | 'did' | 'auto' | 'mem' | 'pub' | 'priv' | 'held'
  // Buried rows are out of the feed, search and counts. This is the one
  // view that shows them, because burial is a state and not a delete —
  // without a way back there is no digging up, only losing.
  | 'buried'

export function matchesFilter(e: LogEntry, f: FeedFilter): boolean {
  switch (f) {
    case 'all':  return true
    case 'said': return e.kind === 'said' || e.kind === 'ideas'
    case 'did':  return e.kind === 'happened' || e.kind === 'made'
    case 'auto': return e.author === 'log'
    case 'mem':  return isFuzzy(e.date_precision)
    case 'pub':  return e.visibility === 'public'
    case 'priv': return e.visibility === 'private'
    case 'held': return e.visibility === 'held'
    // The query already restricted these rows to the buried ones; there is
    // nothing further to match on here.
    case 'buried': return true
    default:     return true
  }
}

/** The words shown on a row's right edge. Public is deliberately unmarked. */
export function tagsFor(e: LogEntry): { text: string; tone: 'plain' | 'pub' | 'priv' | 'held' }[] {
  const out: { text: string; tone: 'plain' | 'pub' | 'priv' | 'held' }[] = []
  if (e.author === 'log') out.push({ text: 'arrived', tone: 'plain' })
  else if (e.kind === 'said' || e.kind === 'ideas') out.push({ text: 'said', tone: 'plain' })
  else out.push({ text: 'did', tone: 'plain' })
  if (isFuzzy(e.date_precision)) out.push({ text: 'from memory', tone: 'plain' })
  if (e.visibility === 'private') out.push({ text: 'private', tone: 'priv' })
  if (e.visibility === 'held') out.push({ text: 'held back', tone: 'held' })
  return out
}
