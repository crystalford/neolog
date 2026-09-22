/**
 * One line saying what a recording is about.
 *
 * ⚠️ 21 Sep — this is a **model writing a sentence**, which is the thing this
 * file's rules forbid most loudly, and it is here because the operator asked
 * for it in those words:
 *
 * > *"the one thing I think it should do is summarize the vlog so that it
 * > says uploaded a video about building neolog and the difficulties I've
 * > been having with it… a nice solid headline describing what the video is
 * > about."*
 *
 * ── Why this is not the thing that was deleted on 20 Sep ────────────────
 *
 * The auto-split took a transcript, guessed where his thoughts broke, and
 * wrote SEVERAL POSTS ATTRIBUTED TO HIM. Three things were wrong with it: it
 * invented the seams, it multiplied one act into many entries, and it put a
 * model's arrangement of his words behind `author='operator'`.
 *
 * This does none of those. A recording already produces exactly one entry,
 * and that entry's line is ALREADY written by the log — `vlogSentence()`
 * composes "Recorded 22 minutes of video." from the file's own duration, and
 * the row already carries `author: 'log'`. This replaces a weak log-written
 * sentence with a useful one, in the same slot, with the same attribution.
 * **The marking rule is untouched: a line the log wrote is marked as the
 * log's, always** — including the ones that read naturally.
 *
 * ── What keeps it honest ────────────────────────────────────────────────
 *
 * - **Only from the transcript.** Never from the frame description, never
 *   from the filename, never from nothing. A recording with no
 *   `transcript_words` gets NO headline and keeps "Recorded a video." — the
 *   same rule the read path held: silence beats a guess.
 * - **It describes; it does not judge.** The prompt forbids an opinion about
 *   whether the recording is good, interesting or worth keeping. §0 rule 2:
 *   the log is quiet. A headline that said "a great conversation about X"
 *   would be the log having a view about his life.
 * - **It is one sentence and it is capped.** Anything longer than a headline
 *   is a summary, and a summary of what he said is the paraphrase this
 *   product exists to refuse.
 * - **His own words are never touched.** This writes `vlogs.headline` and
 *   nothing else. No `log_entries` row's text is rewritten, ever.
 *
 * ⚠️ **Not `vlogs.title`.** That column is in `MODEL_WRITTEN_COLUMNS` and
 * `check-dropped-tables.mjs` fails CI on a read of it — it held the deleted
 * extraction engine's AI-written titles, and reviving it would make the old
 * prose indistinguishable from the new. A new column, and only the new one
 * is read.
 */

import { findOne, findMany, run } from './d1'
import { callChat } from './llm'
import type { D1Database } from '@cloudflare/workers-types'

/** How much of the transcript the model is shown. */
const WORDS_SENT = 1800

/**
 * A headline longer than this is a summary.
 *
 * ⚠️ 21 Sep, after the first ten real ones: five came back and five did not,
 * and the discards were length. Throwing a long line away entirely loses a
 * true sentence over its tail, so anything over the cap is cut back to its
 * last clause boundary and kept if what is left still stands as a line.
 * Only a line with no usable clause in it is thrown away.
 */
const MAX_CHARS = 150

export interface HeadlineEnv {
  AI: { run: (m: unknown, a: unknown) => Promise<unknown> }
}

/**
 * ⚠️ The line completes a sentence: "Recorded a video about ___."
 *
 * That shape is the operator's own — *"uploaded a vlog about building
 * neolog and the difficulties I've been having with it"* — so the model is
 * asked for the phrase that goes after "about", not for a standalone
 * headline. The first ten real ones proved the difference: asked for a
 * headline it returned index-card topic labels ("Algorithms, attention, and
 * culture, and their impact on economies and society, discussed with
 * personal experiences"), which read as a filing system's description of him
 * rather than as a sentence about what he did.
 */
const SYSTEM = [
  'You complete one sentence. The sentence is: "Recorded a video about ___."',
  'You write only the part that goes in the blank, from a transcript of what the speaker said.',
  '',
  'Rules:',
  '- A phrase, not a sentence. Under 16 words. No full stop.',
  '- Begin with a lowercase letter, unless the first word is a name.',
  '- Name the actual things: the projects, places, people and subjects the speaker names.',
  '- Describe only. Never say whether it is good, interesting, important or worth watching.',
  '- Never address the speaker. Never use "you".',
  '- No filler tails: not "and its impact on society", not "discussed with personal',
  '  experiences", not "among other topics", not "and related matters".',
  '- Use only what is in the transcript. If it is too short or says nothing identifiable,',
  '  reply with exactly: NOTHING',
  '',
  'Good: building neolog, and the difficulties with the upload pipeline',
  'Good: driving to Ancaster, and whether to sell the house',
  'Good: the brain-gut axis, and how it shows up in emotional regulation',
  'Bad: An interesting discussion of various topics',
  'Bad: Algorithms, attention and culture, and their impact on economies and society',
].join('\n')

/**
 * Why a recording has no line.
 *
 * ⚠️ 21 Sep — the first two real batches reported "written 5, nothing 5"
 * and "written 3, nothing 7" and NOTHING ANYWHERE SAID WHY. A silence with
 * no reason behind it is the shape of bug this repo keeps paying for: it
 * reads as "the model had nothing to say" when it can equally be a rejected
 * line, a truncated answer or a failed call, and each of those wants a
 * different fix. So every path names itself.
 */
export type HeadlineOutcome =
  | 'written'
  /** Fewer than 25 words of transcript. Nothing to be about. */
  | 'too_short'
  /** The model used its escape hatch, or answered with a refusal in prose. */
  | 'model_said_nothing'
  /** It answered, and `clean()` would not let the answer through. */
  | 'rejected'
  /** The call itself failed. Not stamped — the backlog retries it. */
  | 'call_failed'

export interface HeadlineResult {
  outcome: HeadlineOutcome
  line: string | null
  /** What the model actually said, kept only for a `rejected` answer. */
  raw?: string
}

/**
 * Ask for the line. Returns null when there is nothing honest to say.
 *
 * Every failure path returns null and the row keeps its plain sentence,
 * which is the safe direction: no headline reads as "a recording", and a
 * wrong one reads as a fact about his life.
 */
export async function writeHeadline(
  env: HeadlineEnv,
  db: D1Database,
  vlogId: string,
  operatorId: string,
): Promise<HeadlineResult> {
  // The words as he said them, in order. `transcript_words` is the only
  // source — `transcript_text` can hold prose from a pre-8-Sep run with no
  // timings behind it, and a headline off that is a summary of a summary.
  const row = await findOne<{ words: string }>(
    db,
    `SELECT GROUP_CONCAT(word, ' ') AS words FROM (
       SELECT word FROM transcript_words
        WHERE vlog_id = ? AND operator_id = ?
        ORDER BY word_index ASC
        LIMIT ?
     )`,
    vlogId, operatorId, WORDS_SENT,
  )
  const words = (row?.words || '').trim()
  // Under a couple of sentences there is nothing to be about. Not stamped:
  // a recording can be transcribed again and have words the next time.
  if (words.split(/\s+/).filter(Boolean).length < 25) {
    return { outcome: 'too_short', line: null }
  }

  let said: string
  try {
    const res = await callChat(env as never, {
      system: SYSTEM,
      messages: [{ role: 'user', content: words }],
      // ⚠️ 60 was too tight. A model that opens with a few words of
      // preamble before the phrase runs out of room mid-sentence, and a
      // truncated answer is indistinguishable from a refusal by the time it
      // reaches `clean()`. The line itself is capped at 150 characters, so
      // the ceiling here only needs to be past that with room for a
      // preamble to be stripped.
      maxTokens: 120,
      temperature: 0.2,
    })
    said = (res?.text || '').trim()
  } catch (err: any) {
    // A call that failed is not an answer. Nothing is stamped, so the
    // backlog picks this one up again.
    console.warn(`[headline] call failed for ${vlogId}: ${err?.message || err}`)
    return { outcome: 'call_failed', line: null }
  }

  const line = clean(said)

  // ⚠️ `headline_at` is stamped either way, and that is what stops the log
  // asking again about a recording the model already looked at and had
  // nothing to say about. The same rule the hold-back check follows for a
  // picture it refused: asking a second time eventually produces an answer
  // by persistence rather than by reading.
  await run(
    db,
    `UPDATE vlogs SET headline = ?, headline_at = CURRENT_TIMESTAMP,
                      updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    line, vlogId, operatorId,
  )
  if (line) return { outcome: 'written', line }
  // It answered and the answer was not usable, or it declined. Different
  // facts, and the count has to be able to tell them apart.
  return /^nothing\b/i.test(said)
    ? { outcome: 'model_said_nothing', line: null }
    : { outcome: 'rejected', line: null, raw: said.slice(0, 220) }
}

/**
 * Work through the recordings that have words and no headline yet.
 *
 * Bounded per call and drained from a page visit, the shape
 * `visionTagVlogBacklog` and `lookAtHeldBacklog` both use — a Worker has a
 * subrequest ceiling and `waitUntil` has a time budget, and four hundred
 * recordings in one pass is the mistake this repo has already made twice.
 *
 * Newest first, because that is what he is looking at.
 */
export async function headlineBacklog(
  env: HeadlineEnv,
  db: D1Database,
  operatorId: string,
  max = 4,
): Promise<{
  written: number
  nothing: number
  left: number
  /** How many ended each way — see `HeadlineOutcome` for why this exists. */
  why: Record<string, number>
  /** What was said and refused, so a rejection can be read rather than counted. */
  refused: string[]
}> {
  const rows = await findMany<{ id: string }>(
    db,
    `SELECT v.id FROM vlogs v
      WHERE v.operator_id = ? AND v.deleted_at IS NULL
        AND v.headline IS NULL AND v.headline_at IS NULL
        AND EXISTS (SELECT 1 FROM transcript_words w WHERE w.vlog_id = v.id)
      ORDER BY COALESCE(v.recorded_at, v.created_at) DESC
      LIMIT ?`,
    operatorId, max,
  )

  let written = 0
  let nothing = 0
  const why: Record<string, number> = {}
  const refused: string[] = []
  for (const r of rows) {
    try {
      const res = await writeHeadline(env, db, r.id, operatorId)
      why[res.outcome] = (why[res.outcome] || 0) + 1
      if (res.line) written++
      else {
        nothing++
        if (res.raw) refused.push(res.raw)
      }
    } catch (err: any) {
      console.warn(`[headline] ${r.id}: ${err?.message || err}`)
      why.threw = (why.threw || 0) + 1
      nothing++
    }
  }

  const rest = await findOne<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM vlogs v
      WHERE v.operator_id = ? AND v.deleted_at IS NULL
        AND v.headline IS NULL AND v.headline_at IS NULL
        AND EXISTS (SELECT 1 FROM transcript_words w WHERE w.vlog_id = v.id)`,
    operatorId,
  )
  return { written, nothing, left: rest?.n ?? 0, why, refused }
}

/**
 * What comes back, or nothing.
 *
 * A model asked for one line will sometimes return a preamble, quotes, or a
 * refusal in prose. None of those is a headline, and a half-usable one is
 * worse than none — it would sit on the feed looking like a fact.
 */
export function clean(raw: string): string | null {
  let s = (raw || '').trim()
  if (!s) return null

  // Its own escape hatch, and anything that reads like one.
  if (/^nothing\b/i.test(s)) return null

  // Strip a wrapper the instructions asked it not to add.
  s = s.replace(/^["'`\s]+|["'`\s]+$/g, '')
  s = s.replace(/^(headline|summary|line|answer)\s*:\s*/i, '')
  // Including the stem of the sentence it was asked to complete, which a
  // model will sometimes hand back whole.
  s = s.replace(/^(recorded|uploaded)\s+a\s+(video|vlog)\s+(about\s+)?/i, '')
  s = s.replace(/^(this video is|the video is|a video|this is)\s+(about\s+)?/i, '')
  s = s.replace(/^(about|on)\s+/i, '')
  s = s.replace(/^the speaker\s+/i, '')
  s = s.trim()
  if (!s) return null

  // One sentence. If it produced several, the first is the headline and the
  // rest is the summary nobody asked for.
  const firstBreak = s.search(/[.!?](\s|$)/)
  if (firstBreak > 0) s = s.slice(0, firstBreak)
  s = s.replace(/[.,;:\s]+$/, '').trim()

  // ⚠️ Too long is cut, not discarded. Five of the first ten real lines were
  // thrown away whole for overrunning, each of them true up to its tail — so
  // the tail goes and the clause that carries the subject stays. A line with
  // no clause boundary before the cap has nothing safe to keep and goes.
  if (s.length > MAX_CHARS) {
    const cut = s.slice(0, MAX_CHARS)
    const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' — '), cut.lastIndexOf('; '))
    if (at < 20) return null
    s = s.slice(0, at).replace(/[,;:\s]+$/, '').trim()
  }

  if (s.length < 8) return null
  // A line with no letters in it is not a headline.
  if (!/[a-z]/i.test(s)) return null
  return s
}

/**
 * The sentence a recording shows on the feed.
 *
 * The headline when there is one, the plain line when there is not. Both are
 * the log's — which is why the row's `author` does not change either way.
 */
export function recordingSentence(headline: string | null, plain: string): string {
  const h = (headline || '').trim()
  return h ? `Recorded a video about ${h}.` : plain
}
