/**
 * Clip-quality judge — would this candidate travel as a standalone short?
 *
 * The extractor flags `clip_candidates` it thinks are delivery moments,
 * but its standards are loose. Many candidates are technically-correct
 * verbatim quotes that wouldn't actually do anything on a feed: they
 * trail off, reference unstated context, are interesting only because
 * of what comes around them, or are the operator audibly thinking out
 * loud (raw process, not landed insight).
 *
 * This judge is a second LLM pass — one gpt-oss low-effort call per
 * candidate — that reads the proposed clip with 30s of pre- and post-
 * transcript context and rates it 1–5 across four hard criteria. Score
 * persists on the row; the auto-promote sweep requires score >= 4 to
 * ship. Re-runs are free because we skip rows that already have a
 * `clippability_judged_at`.
 *
 * Cost: ~1-2 seconds per candidate. A 20-min vlog typically yields 3-8
 * candidates → ~15s of judging work, fired once at sweep time. Cheap.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { findOne, findMany, run } from './d1'
import { callReasoning } from './models'

interface JudgeEnv {
  AI: { run: (...args: any[]) => Promise<any> } | any
  DB?: D1Database
}

const CONTEXT_WINDOW_SEC = 30
const SCORE_FLOOR_FOR_AUTO_PUBLISH = 4

export interface ClippabilityJudgment {
  score: number             // 1-5
  lands_without_setup: 0 | 1
  memorable_line: 0 | 1
  standalone_resonance: 0 | 1
  delivered_with_conviction: 0 | 1
  verdict: string           // one short sentence
  suggested_caption_hook: string  // ≤80 chars or empty
}

const SYSTEM_PROMPT = `You judge whether a moment from a personal vlog would travel as a standalone short social clip (TikTok / Reels / X / YouTube Shorts).

Standards. A clip travels if it nails ALL of these:
1. LANDS WITHOUT SETUP — a stranger seeing only this clip understands it. No "like I said earlier", no callbacks, no half-sentences.
2. MEMORABLE LINE — there is a phrase or sentence you'd actually quote, not just a thought.
3. STANDALONE RESONANCE — it stands on its own as an idea or insight, not as a fragment of a longer argument.
4. DELIVERED WITH CONVICTION — the operator is committing to the line, not muttering or audibly figuring it out.

REJECT (score 1-2) when:
- The clip trails off mid-thought.
- It references unstated context.
- It is interesting only because of what came around it (use pre/post context to detect this).
- The operator is mid-process — thinking out loud, not landing the line.
- It's a setup line for something that comes after the clip end.

Reward (score 4-5) only clips that would actually do work on a feed. Be brutal. The default outcome is 2-3.

You receive: the candidate clip's transcript with [START] and [END] markers, plus ~30 seconds of context before [START] and after [END].

Output ONE JSON object, no markdown, no commentary:
{"score":<1-5 int>,"lands_without_setup":<0|1>,"memorable_line":<0|1>,"standalone_resonance":<0|1>,"delivered_with_conviction":<0|1>,"verdict":"<one short sentence>","suggested_caption_hook":"<phrase ≤80 chars or empty>"}`

/**
 * Judge one candidate. Returns the parsed judgment, or null if the
 * model output couldn't be parsed (in which case the caller treats the
 * candidate as unjudged — score stays NULL).
 */
export async function judgeClipTravel(
  env: JudgeEnv,
  args: {
    db: D1Database
    vlogId: string
    startTime: number
    endTime: number
    headline: string
    quote: string | null
  },
): Promise<ClippabilityJudgment | null> {
  const { db, vlogId, startTime, endTime, headline, quote } = args

  // Pull the clip transcript + pre/post context window from
  // transcript_words. If transcript_words is empty (older vlogs), fall
  // back to the quote alone with no context — the judge will be
  // harsher (no context = harder to satisfy "lands without setup") but
  // it still runs.
  const ctxStart = Math.max(0, startTime - CONTEXT_WINDOW_SEC)
  const ctxEnd = endTime + CONTEXT_WINDOW_SEC

  const words = await findMany<{ word: string; start_time: number; end_time: number }>(
    db,
    `SELECT word, start_time, end_time FROM transcript_words
      WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
      ORDER BY word_index ASC LIMIT 2000`,
    vlogId, ctxStart, ctxEnd,
  )

  let body = ''
  if (words.length > 0) {
    const parts: string[] = []
    let inClip = false
    let startedClip = false
    let endedClip = false
    for (const w of words) {
      if (!startedClip && w.start_time >= startTime) {
        parts.push('[START]')
        startedClip = true
        inClip = true
      }
      if (!endedClip && inClip && w.end_time >= endTime) {
        parts.push(w.word)
        parts.push('[END]')
        endedClip = true
        inClip = false
        continue
      }
      parts.push(w.word)
    }
    if (!endedClip) parts.push('[END]')
    body = parts.join(' ').replace(/\s+([,.!?;:])/g, '$1')
  } else if (quote) {
    body = `[START] ${quote} [END]\n(No surrounding context available — judge based on the clip alone.)`
  } else {
    return null
  }

  const userPrompt = `Headline (extractor's guess at what makes this clippable, for tone only — do not let it bias you):
${headline || '(none)'}

Transcript with the proposed clip marked:
${body.slice(0, 6000)}

Judge this clip. Output the JSON object only.`

  let raw: string
  try {
    const out = await callReasoning(env as any, {
      system: SYSTEM_PROMPT,
      user: userPrompt,
      effort: 'low',
      maxTokens: 500,
    })
    raw = (out.text || '').trim()
  } catch (err: any) {
    console.warn(`[clip-judge] LLM call failed for vlog ${vlogId}: ${err?.message || err}`)
    return null
  }

  return parseJudgment(raw)
}

/**
 * Parse the model output. Handles raw JSON, markdown-fenced JSON, and
 * leading-prose-then-JSON. Returns null if no recoverable object.
 */
function parseJudgment(raw: string): ClippabilityJudgment | null {
  if (!raw) return null
  // Strip markdown fence if present.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // Find the first {...} block.
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const jsonStr = cleaned.slice(start, end + 1)
  let obj: any
  try { obj = JSON.parse(jsonStr) } catch { return null }
  const score = Math.max(1, Math.min(5, Number(obj.score) | 0))
  return {
    score,
    lands_without_setup: obj.lands_without_setup ? 1 : 0,
    memorable_line: obj.memorable_line ? 1 : 0,
    standalone_resonance: obj.standalone_resonance ? 1 : 0,
    delivered_with_conviction: obj.delivered_with_conviction ? 1 : 0,
    verdict: String(obj.verdict ?? '').trim().slice(0, 240),
    suggested_caption_hook: String(obj.suggested_caption_hook ?? '').trim().slice(0, 80),
  }
}

/**
 * Judge every un-judged candidate for a vlog and persist the scores.
 * Bounded so a backlog doesn't blow the wall-clock on a single sweep.
 * Returns the count judged.
 */
export async function judgeUnscoredClipsForVlog(
  env: JudgeEnv,
  operatorId: string,
  vlogId: string,
  max = 8,
): Promise<{ judged: number; errors: number }> {
  const db = env.DB!
  const rows = await findMany<{
    id: string; start_time: number; end_time: number
    headline: string; quote: string | null
  }>(
    db,
    `SELECT id, start_time, end_time, headline, quote
       FROM clip_candidates
      WHERE operator_id = ? AND vlog_id = ?
        AND deleted_at IS NULL AND status = 'pending'
        AND clippability_score IS NULL
        AND validated = 1
      ORDER BY created_at ASC
      LIMIT ?`,
    operatorId, vlogId, max,
  )

  let judged = 0
  let errors = 0
  for (const r of rows) {
    const j = await judgeClipTravel(env, {
      db,
      vlogId,
      startTime: r.start_time,
      endTime: r.end_time,
      headline: r.headline,
      quote: r.quote,
    })
    if (!j) { errors++; continue }
    try {
      await run(
        db,
        `UPDATE clip_candidates
            SET clippability_score = ?,
                clippability_judged_at = CURRENT_TIMESTAMP,
                clippability_verdict = ?,
                suggested_caption_hook = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        j.score, j.verdict, j.suggested_caption_hook, r.id,
      )
      judged++
    } catch (err: any) {
      console.warn(`[clip-judge] persist failed for ${r.id}: ${err?.message || err}`)
      errors++
    }
  }
  return { judged, errors }
}

export { SCORE_FLOOR_FOR_AUTO_PUBLISH }
