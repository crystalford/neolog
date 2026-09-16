/**
 * Search — asking the log a question.
 *
 * `search.html`: "Ask the log a question. The answer is written only from
 * passages it can point at — a number on every sentence."
 *
 * ── The contract, from LLM-PIPELINE §2 and §9 ────────────────────────────
 *
 * §2  Retrieval → reduce → cite. **Never corpus-dump.** The model sees a
 *     numbered list of real passages and nothing else.
 * §9  1. The model never asserts anything without a span ID.
 *     2. Verbatim spans are the only ground truth; every summary is an index
 *        into them.
 *     8. Contradictions are surfaced as disputes, never resolved by the model.
 *
 * Enforced here in code rather than trusted to the prompt: after the model
 * answers, **every sentence is checked for a citation and every citation is
 * checked against the passages that were actually sent.** A sentence with no
 * citation, or one pointing at a passage number that does not exist, is
 * dropped before the operator sees it. A model that cites nothing produces
 * an empty answer and the passages stand on their own — which is a worse
 * answer and an honest one.
 *
 * ── The abstain path ─────────────────────────────────────────────────────
 *
 * The design's example is the important half: *"Not answered: why you left.
 * You've said it ended, four times, and never why — so no guess."*
 *
 * The model is asked for that explicitly, and it is the one part of the
 * output that is allowed to have no citation, because it is a statement
 * about what is missing.
 *
 * ── Retrieval is keyword, and says so ────────────────────────────────────
 *
 * There are no embeddings in this stack. Retrieval matches words against the
 * entry text, the log's own line, and the transcript of every recording. It
 * finds what was said in those words and misses what was said in others —
 * the page says so rather than implying the log has read everything and
 * decided.
 */

import { findMany, findOne } from '@/lib/d1'
import { callReasoning } from '@/lib/models'
import type { D1Database } from '@cloudflare/workers-types'

export interface Passage {
  /** 1-based, and what the answer's citations point at. */
  n: number
  entry_id: string | null
  vlog_id: string | null
  kind: 'entry' | 'recording'
  /** The words themselves. Never a summary. */
  quote: string
  happened_at: string
  date_precision: string
  /** 'said by you' | 'recalled' | 'written by the log' */
  whose: string
  source: string
  /** Seconds into the recording, when it came from one. */
  span_start: number | null
  href: string
}

export interface SearchAnswer {
  question: string
  /** Sentences that survived the citation check, in order. */
  answer: string[]
  /** What the log could not answer, in its own words. May be empty. */
  not_answered: string | null
  passages: Passage[]
  counts: { said: number; recalled: number; from_file: number }
  model: string | null
  /** Sentences the model produced that were dropped, and why. */
  dropped: number
  /**
   * Recordings with no word timings. Retrieval reads `log_entries` and
   * `transcript_words`, so a recording that has never been transcribed is
   * not searched — it is not "no match", it is not looked at. The page says
   * so, because a search that silently misses most of the corpus reads as
   * an answer about the whole log.
   *
   * ⚠️ This is a COUNT, not a list. `search.html`'s `.h thin` row names a
   * particular untranscribed file as one that "might be relevant" — to do
   * that the log would have to decide which unread file bears on this
   * question, which it cannot know, because it has not read it. That is
   * the fence `/footage` draws in the same words. How many it could not
   * see is a fact; which one matters is a guess.
   */
  unsearchable: number
}

interface SearchEnv {
  AI: { run: (model: any, args: any) => Promise<any> }
}

const MAX_PASSAGES = 12

/** Words worth matching on. Drops the ones every sentence contains. */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'is', 'was', 'are', 'were', 'be', 'been', 'it', 'this', 'that',
  'i', 'you', 'my', 'me', 'we', 'do', 'did', 'does', 'what', 'when', 'why',
  'how', 'who', 'about', 'ever', 'every', 'time', 'said', 'say', 'says',
])

export function queryTerms(q: string): string[] {
  return Array.from(new Set(
    q.toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3 && !STOP.has(w)),
  )).slice(0, 8)
}

/**
 * Find passages. Entries first, because those are already reduced to a line;
 * then the transcripts, which is where most of what he said actually lives.
 */
export async function findPassages(
  db: D1Database,
  operatorId: string,
  question: string,
): Promise<Passage[]> {
  const terms = queryTerms(question)
  if (!terms.length) return []

  const like = terms.map(() => `(LOWER(text) LIKE ? OR LOWER(COALESCE(detail,'')) LIKE ?)`).join(' OR ')
  const binds = terms.flatMap(t => [`%${t}%`, `%${t}%`])

  const entries = await findMany<{
    id: string; text: string; detail: string | null
    happened_at: string; occurred_at: string; created_at: string
    date_precision: string; author: string; source_kind: string
    vlog_id: string | null; span_start: number | null
  }>(
    db,
    `SELECT id, text, detail,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            occurred_at, created_at, date_precision, author, source_kind,
            vlog_id, span_start
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND (${like})
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 40`,
    operatorId, ...binds,
  )

  // Score by how many distinct query words a passage actually contains.
  const scored = entries.map(e => {
    const hay = `${e.text} ${e.detail || ''}`.toLowerCase()
    const hits = terms.filter(t => hay.includes(t)).length
    return { e, hits }
  }).filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits)

  const out: Passage[] = []
  for (const { e } of scored.slice(0, MAX_PASSAGES)) {
    out.push({
      n: out.length + 1,
      entry_id: e.id,
      vlog_id: e.vlog_id,
      kind: 'entry',
      quote: e.text,
      happened_at: e.happened_at,
      date_precision: e.date_precision,
      whose: e.author === 'operator'
        ? (e.date_precision === 'year' || e.date_precision === 'approx' ? 'recalled' : 'said by you')
        : 'written by the log',
      source: sourceLabel(e.source_kind),
      span_start: e.span_start,
      href: `/entry/${e.id}`,
    })
  }

  // Then recordings whose transcript mentions it and which produced no
  // matching entry — the words are there even when nothing was extracted.
  if (out.length < MAX_PASSAGES) {
    const tLike = terms.map(() => `LOWER(transcript_text) LIKE ?`).join(' OR ')
    const tBinds = terms.map(t => `%${t}%`)
    const vlogs = await findMany<{
      id: string; transcript_text: string | null
      recorded_at: string | null; created_at: string; duration_seconds: number | null
    }>(
      db,
      `SELECT id, transcript_text, recorded_at, created_at, duration_seconds
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
          AND transcript_text IS NOT NULL AND (${tLike})
        ORDER BY COALESCE(recorded_at, created_at) DESC
        LIMIT ?`,
      operatorId, ...tBinds, MAX_PASSAGES,
    )
    const already = new Set(out.map(p => p.vlog_id).filter(Boolean))
    for (const v of vlogs) {
      if (out.length >= MAX_PASSAGES) break
      if (already.has(v.id)) continue
      const excerpt = excerptAround(v.transcript_text || '', terms)
      if (!excerpt) continue
      out.push({
        n: out.length + 1,
        entry_id: null,
        vlog_id: v.id,
        kind: 'recording',
        quote: excerpt,
        happened_at: v.recorded_at || v.created_at,
        date_precision: v.recorded_at ? 'exact' : 'approx',
        whose: 'said by you',
        source: 'a recording',
        span_start: null,
        href: `/vlog/${v.id}`,
      })
    }
  }

  return out
}

function sourceLabel(k: string): string {
  switch (k) {
    case 'vlog':  return 'a recording'
    case 'voice': return 'a voice note'
    case 'file':  return 'a file'
    case 'link':  return 'a link'
    case 'recall': return 'a recall answer'
    case 'batch': return 'an upload'
    default:      return 'typed'
  }
}

/** The sentence around the first match, so a passage is readable on its own. */
function excerptAround(transcript: string, terms: string[]): string | null {
  const lower = transcript.toLowerCase()
  let at = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  if (at < 0) return null
  const start = Math.max(0, transcript.lastIndexOf('.', at) + 1)
  let end = transcript.indexOf('.', at + 1)
  if (end < 0) end = Math.min(transcript.length, at + 320)
  const s = transcript.slice(start, end + 1).trim()
  return s.length > 20 ? (s.length > 420 ? `${s.slice(0, 418)}…` : s) : null
}

// ── The answer ────────────────────────────────────────────────────────────

const SYSTEM = `You answer a question about a person's own log, using ONLY the numbered passages you are given.

Rules, and they are absolute:
- Every sentence of the answer ends with one or more citations in square brackets: [1], [2], [1][4]. A sentence you cannot cite is a sentence you do not write.
- Never cite a number that is not in the passages given to you.
- Quote his words only when they appear in a passage, and mark them with quotation marks.
- If two passages disagree, say so and cite both. Do not decide which is right.
- Dates: say what the passages say. If a passage is marked "recalled", treat its date as approximate and say so.
- Do not add anything you were not given: no background, no advice, no interpretation of what he meant or why he did something.

Then, on its own line, write:
NOT ANSWERED: <the part of the question the passages do not answer, in one sentence — or the word NONE>

This last line is the only one without a citation, because it is about what is missing.

Write plainly. Subject, verb, object. Second person ("you said", "you have"). No preamble, no summary of what you are about to say.`

/**
 * Ask. Returns only what survived the citation check.
 */
export async function answerFromPassages(
  env: SearchEnv,
  question: string,
  passages: Passage[],
): Promise<{ answer: string[]; not_answered: string | null; model: string | null; dropped: number }> {
  if (!passages.length) return { answer: [], not_answered: null, model: null, dropped: 0 }

  const numbered = passages.map(p => {
    const when = p.happened_at.slice(0, 10)
    return `[${p.n}] ${when} · ${p.source} · ${p.whose}\n"${p.quote.replace(/\s+/g, ' ').trim()}"`
  }).join('\n\n')

  let text = ''
  let model: string | null = null
  try {
    const res = await callReasoning(env as any, {
      system: SYSTEM,
      user: `Question: ${question}\n\nPassages:\n\n${numbered}`,
      effort: 'medium',
      maxTokens: 900,
    })
    text = res.text || ''
    model = res.model
  } catch {
    return { answer: [], not_answered: null, model: null, dropped: 0 }
  }

  // ── The citation check, in code ────────────────────────────────────────
  const valid = new Set(passages.map(p => p.n))
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  let notAnswered: string | null = null
  const body: string[] = []
  for (const line of lines) {
    const m = line.match(/^NOT\s+ANSWERED:\s*(.*)$/i)
    if (m) {
      const v = m[1].trim()
      notAnswered = (!v || /^none\.?$/i.test(v)) ? null : v
      continue
    }
    body.push(line)
  }

  const sentences = body.join(' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  const kept: string[] = []
  let dropped = 0
  for (const s of sentences) {
    const cites = Array.from(s.matchAll(/\[(\d+)\]/g)).map(m => parseInt(m[1], 10))
    // No citation, or a citation pointing at a passage that was never sent.
    if (!cites.length || cites.some(c => !valid.has(c))) { dropped++; continue }
    kept.push(s)
  }

  return { answer: kept, not_answered: notAnswered, model, dropped }
}

export async function search(
  env: SearchEnv,
  db: D1Database,
  operatorId: string,
  question: string,
): Promise<SearchAnswer> {
  const passages = await findPassages(db, operatorId, question)
  const { answer, not_answered, model, dropped } = await answerFromPassages(env, question, passages)
  const unread = await findOne<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n
       FROM vlogs v
      WHERE v.operator_id = ? AND v.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM transcript_words w WHERE w.vlog_id = v.id)`,
    operatorId,
  )
  return {
    question,
    answer,
    not_answered,
    passages,
    counts: {
      said: passages.filter(p => p.whose === 'said by you').length,
      recalled: passages.filter(p => p.whose === 'recalled').length,
      from_file: passages.filter(p => p.whose === 'written by the log').length,
    },
    model,
    dropped,
    unsearchable: Number(unread?.n || 0),
  }
}
