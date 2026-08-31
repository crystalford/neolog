/**
 * GET /api/v2/admin/corpus-read
 *
 * The whole-corpus read. Every extracted take the operator has ever
 * recorded, in chronological order, in a single prompt — asking what the
 * ARC is across all of it.
 *
 * This is the question the system has never asked. Per-vlog extraction
 * looks at one recording. The clip judge looks at 30 seconds. Nothing has
 * ever read the entire record at once and asked what it adds up to.
 *
 * It's affordable because the takes ARE the first rung of the reduction
 * ladder: ~299 vlogs of raw transcript is ~1.2M tokens and fits nowhere,
 * but the extracted takes are ~40-80K tokens and fit in any current model.
 *
 * Query params:
 *   - source: 'takes' (default) reads the extracted threads.take field —
 *             an LLM-mediated compression of each vlog, small and cheap.
 *             'transcript' reads vlogs.transcript_text directly — the raw
 *             Whisper output, nothing summarized, nothing dropped, at
 *             whatever size that actually is (use dry=1 to find out before
 *             committing to a real LLM call at that size).
 *   - raw: '1' to return the assembled corpus and skip inference entirely.
 *          Use this for a full-corpus read — the in-Worker call below 502s
 *          on the whole record (see the note at that branch).
 *   - dry: '1' to return corpus stats + a sample without calling the LLM
 *   - max_takes: cap on rows fetched (default 4000, applies to either
 *     source — a "row" is one take or one vlog depending on source).
 *     Response reports whether it truncated.
 *   - model: override (default claude-opus-5 — 1M context, best available;
 *            this is a once-in-a-while read, quality beats cost here)
 *   - min_strength: only include takes at/above this strength (default 0,
 *     ignored for source=transcript — vlogs don't have a strength score)
 *
 * Read-only. Writes nothing. Safe to re-run.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { callClaude } from '@/lib/anthropic'
import type { D1Database } from '@cloudflare/workers-types'

export const runtime = 'edge'

interface Env {
  DB: D1Database
  ANTHROPIC_API_KEY: string
  [k: string]: unknown
}

const DEFAULT_MODEL = 'claude-opus-5'

const SYSTEM_PROMPT = `You are reading the complete chronological record of one person's recorded thinking, extracted from years of video logs he recorded alone, talking to a camera.

Each entry is a "take" — the substance of one thing he said in one recording, with its date. This is not a transcript; it is the reduced form of everything he has said on record.

Your job is NOT to summarize. Summaries of this material are worthless — they come out as "he thinks about technology and self-improvement," which describes anyone. Your job is to find the ARC: the shape this record makes over time, which is only visible from reading all of it at once and which he cannot see himself because he lived it one day at a time.

HARD RULES:
- Every single claim you make must be anchored to a verbatim quote from the record. Quote it. If you cannot quote it, do not claim it.
- Cite dates. "In early 2026 he said X" is useless without the quote; "2026-03-14: 'exact words'" is evidence.
- No therapy-speak, no encouragement, no flattery, no advice. You are a historian reading a primary source, not a coach.
- Do not soften his language. If he swears, quote the swearing.
- Specificity or silence. If a section has nothing real in it, say "nothing here" and move on. An honest empty section is worth more than a padded one.

Write these sections, in this order, using the exact headings:

## THE ARC
The shape of the whole record over time, in 6-12 sentences. What was he doing at the start, what is he doing now, and what actually happened in between. Anchor the turns to dates and quotes.

## WHAT HE CIRCLES
The things he returns to again and again, ranked by how much of the record they occupy. For each: what it is, roughly when it starts and whether it's still live, and how his position on it CHANGED over time — quote an early instance and a late one so the drift is visible.

## TURNS
Specific dated moments where something shifted — a decision, an abandonment, a realization, a change of tone. Quote the moment itself. These are the beats of the story.

## WHAT HE STOPPED SAYING
Things that occupied the record for a stretch and then vanish. Give the last date each appears. Disappearances are as informative as recurrences and he will have no memory of them.

## WHAT HE NEVER SAYS
The most important section. Things he circles constantly, at an abstract or oblique angle, without ever stating plainly — where the record goes quiet or goes theoretical every time it gets near something. Name the specific gap and show the circling with quotes. Do not psychoanalyse; show the pattern in his own words and let it speak.

## LOGLINE
The entire record in one sentence. Not a description of topics — the story it tells.`

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const url = new URL(req.url)
  const maxTakes = Math.min(parseInt(url.searchParams.get('max_takes') || '4000', 10) || 4000, 8000)
  const model = url.searchParams.get('model') || DEFAULT_MODEL
  const dry = url.searchParams.get('dry') === '1'
  const minStrength = parseInt(url.searchParams.get('min_strength') || '0', 10) || 0
  const source = url.searchParams.get('source') === 'transcript' ? 'transcript' : 'takes'

  const db = getDb(env)

  let lines: string[] = []
  let spanStart: string | null = null
  let spanEnd: string | null = null
  let distinctVlogs = 0
  let rowsFetched = 0

  if (source === 'transcript') {
    // Raw Whisper output, one vlog per block, nothing summarized. Ordered
    // by recorded_at like the takes path, so the two are comparable.
    let vlogRows: Array<{ recorded_at: string | null; transcript_text: string | null; id: string }> = []
    try {
      vlogRows = await findMany(
        db,
        `SELECT id, recorded_at, transcript_text FROM vlogs
          WHERE operator_id = ? AND deleted_at IS NULL
            AND transcript_text IS NOT NULL AND transcript_text != ''
          ORDER BY recorded_at ASC LIMIT ?`,
        operator.id, maxTakes,
      )
    } catch (err: any) {
      return NextResponse.json({ error: `corpus query failed: ${err?.message || err}` }, { status: 500 })
    }
    if (vlogRows.length === 0) {
      return NextResponse.json({ error: 'No transcripts found.', operator_id: operator.id }, { status: 404 })
    }
    for (const v of vlogRows) {
      const date = (v.recorded_at || '').slice(0, 10) || 'undated'
      const body = (v.transcript_text || '').replace(/\s+/g, ' ').trim()
      if (!body) continue
      lines.push(`--- ${date} ---\n${body}`)
    }
    spanStart = vlogRows.find(v => v.recorded_at)?.recorded_at ?? null
    spanEnd = [...vlogRows].reverse().find(v => v.recorded_at)?.recorded_at ?? null
    distinctVlogs = vlogRows.length
    rowsFetched = vlogRows.length
  } else {
    // Every take, chronological by when it was RECORDED (not extracted) —
    // the arc is a property of when he said things, not when we processed
    // them. Only rows from the active extraction run, so re-extracted vlogs
    // don't double-count.
    let takes: Array<{
      recorded_at: string | null
      topic: string
      take: string | null
      strength: number | null
      abstracted_topic: string | null
      vlog_id: string
    }> = []
    try {
      takes = await findMany(
        db,
        `SELECT v.recorded_at, t.topic, t.take, t.strength, t.abstracted_topic, t.vlog_id
           FROM threads t
           JOIN vlogs v ON v.id = t.vlog_id
           JOIN extraction_runs er ON er.id = t.run_id
          WHERE t.operator_id = ?
            AND t.deleted_at IS NULL
            AND v.deleted_at IS NULL
            AND er.is_active = 1
            AND COALESCE(t.strength, 0) >= ?
          ORDER BY v.recorded_at ASC, t.transcript_span_start ASC
          LIMIT ?`,
        operator.id, minStrength, maxTakes,
      )
    } catch (err: any) {
      return NextResponse.json({ error: `corpus query failed: ${err?.message || err}` }, { status: 500 })
    }
    if (takes.length === 0) {
      return NextResponse.json({
        error: 'No takes found. Either nothing has been extracted, or no extraction_run is marked active.',
        operator_id: operator.id,
      }, { status: 404 })
    }
    for (const t of takes) {
      const date = (t.recorded_at || '').slice(0, 10) || 'undated'
      const body = (t.take || t.topic || '').replace(/\s+/g, ' ').trim()
      if (!body) continue
      const topicTag = t.abstracted_topic && !body.toLowerCase().includes(t.abstracted_topic.toLowerCase())
        ? ` [${t.abstracted_topic}]`
        : ''
      const str = t.strength != null ? ` (${t.strength}/5)` : ''
      lines.push(`${date}${str}${topicTag} ${body}`)
    }
    spanStart = takes.find(t => t.recorded_at)?.recorded_at ?? null
    spanEnd = [...takes].reverse().find(t => t.recorded_at)?.recorded_at ?? null
    distinctVlogs = new Set(takes.map(t => t.vlog_id)).size
    rowsFetched = takes.length
  }

  const corpus = lines.join('\n')

  const stats = {
    source,
    takes_used: lines.length,
    takes_fetched: rowsFetched,
    distinct_vlogs: distinctVlogs,
    truncated: rowsFetched >= maxTakes,
    corpus_chars: corpus.length,
    corpus_tokens_est: Math.round(corpus.length / 4),
    span_start: spanStart,
    span_end: spanEnd,
    min_strength: minStrength,
    model,
  }

  if (dry) {
    return NextResponse.json({
      dry_run: true,
      stats,
      sample_head: lines.slice(0, 12),
      sample_tail: lines.slice(-12),
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // raw=1 returns the rendered corpus and does no inference.
  //
  // The in-Worker LLM call (below) 502s on a full corpus: an ~80K-token
  // request to Claude takes longer than a Pages Function's budget allows,
  // and Cloudflare kills the isolate. Rather than chunk the analysis and
  // lose the whole point — that the arc is only visible when the record is
  // read ALL AT ONCE — this mode hands the assembled corpus to a caller
  // that has no such time limit and a large enough context to hold it.
  // Same corpus, same ordering, no truncation; only the inference moves.
  if (url.searchParams.get('raw') === '1') {
    return NextResponse.json({
      raw: true,
      stats,
      corpus,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const userPrompt = `Here is the complete record, one take per line, oldest first. Format: DATE (strength/5) [topic] what he said.

${corpus}

Read all of it and write the six sections. Quote constantly — every claim anchored to his own words with its date.`

  const started = Date.now()
  try {
    const out = await callClaude(env, {
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 8000,
    })
    return NextResponse.json({
      stats,
      elapsed_ms: Date.now() - started,
      usage: { input_tokens: out.inputTokens, output_tokens: out.outputTokens },
      model_used: out.model,
      stop_reason: out.stopReason,
      reading: out.text,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({
      error: `corpus read failed: ${err?.message || String(err)}`,
      stats,
      elapsed_ms: Date.now() - started,
    }, { status: 502 })
  }
}
