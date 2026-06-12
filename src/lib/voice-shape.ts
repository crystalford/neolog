/**
 * Voice-shape — pull the operator's strongest spoken takes (with their
 * actual verbatim transcript spans) and format them as few-shot examples
 * for a generator that needs to write in their voice. Used by:
 *   - the Topics surface (writing essays on arbitrary subjects)
 *   - any future "write in my voice" generator
 *
 * What's shipped here is style anchoring, not content reuse. The samples
 * teach the model HOW the operator writes (cadence, register, where they
 * land, what they hedge, the moves they make) — not WHAT to write. The
 * content of the new piece is anchored on the topic, not on the samples.
 *
 * The samples are picked for STRONG, VARIED takes, not the most-recent or
 * the most-frequent. Strength + register diversity is what teaches voice.
 */

import { findMany } from './d1'
import type { D1Database } from '@cloudflare/workers-types'

interface VoiceSample {
  topic: string
  register: string | null
  take: string
  verbatim: string | null
}

/**
 * Pull N voice samples for an operator. Each sample includes the original
 * `take` text and (when transcript_words is populated) the verbatim spoken
 * span — the rawest evidence of how the operator actually talks.
 */
export async function loadVoiceSamples(
  db: D1Database,
  operatorId: string,
  n = 6,
): Promise<VoiceSample[]> {
  // Prefer strength=5 takes, mix registers if possible. Limit to threads
  // whose extraction_run is still active so we don't pull stale takes.
  const rows = await findMany<{
    thread_id: string; vlog_id: string; topic: string; take: string | null
    register: string | null; strength: number | null
    span_start: number | null; span_end: number | null
  }>(
    db,
    `SELECT t.id AS thread_id, t.vlog_id, t.topic, t.take, t.register, t.strength,
            t.transcript_span_start AS span_start,
            t.transcript_span_end   AS span_end
       FROM threads t
      WHERE t.operator_id = ? AND t.deleted_at IS NULL
        AND t.take IS NOT NULL AND length(t.take) > 80
        AND NOT EXISTS (SELECT 1 FROM extraction_runs er WHERE er.id = t.run_id AND er.is_active = 0)
      ORDER BY t.strength DESC, length(t.take) DESC
      LIMIT ?`,
    operatorId, Math.max(n * 3, 12),
  )

  // Mix registers: keep at most 2 of any single register, walk in order until
  // we hit n. This stops a "argument argument argument" pull from boring the
  // model into one tonal mode.
  const byRegister = new Map<string, number>()
  const picked: typeof rows = []
  for (const r of rows) {
    if (picked.length >= n) break
    const reg = r.register ?? 'observation'
    const count = byRegister.get(reg) ?? 0
    if (count >= 2 && picked.length < n) continue
    byRegister.set(reg, count + 1)
    picked.push(r)
  }
  // If we under-shot (e.g. one operator with everything in one register),
  // top up from the original list.
  for (const r of rows) {
    if (picked.length >= n) break
    if (!picked.find(p => p.thread_id === r.thread_id)) picked.push(r)
  }

  // For each, pull the verbatim span when available.
  const samples: VoiceSample[] = []
  for (const r of picked) {
    let verbatim: string | null = null
    if (r.span_start != null && r.span_end != null) {
      try {
        const words = await findMany<{ word: string }>(
          db,
          `SELECT word FROM transcript_words
            WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
            ORDER BY word_index ASC LIMIT 250`,
          r.vlog_id, r.span_start, r.span_end,
        )
        if (words.length > 0) {
          verbatim = words.map(w => w.word).join(' ').slice(0, 1200)
        }
      } catch {}
    }
    samples.push({
      topic: r.topic,
      register: r.register,
      take: (r.take ?? '').slice(0, 800),
      verbatim,
    })
  }
  return samples
}

/**
 * Format voice samples as a single prompt block. The block is dropped into
 * the system message of any generator that needs voice anchoring.
 */
export function formatVoiceSamples(samples: VoiceSample[]): string {
  if (samples.length === 0) return ''
  const lines = samples.map((s, i) => {
    const body = (s.verbatim || s.take).replace(/\s+/g, ' ').trim()
    return `[VOICE SAMPLE ${i + 1}] register: ${s.register ?? 'observation'} · topic-cue: ${s.topic}\n"${body}"`
  })
  return `\n\n═══════════════════════════════════════════════════════════════\nVOICE SHAPE — the operator's actual way of writing/speaking. STUDY THE CADENCE, RHYTHM, HEDGES, MOVES. The new piece must read like the SAME PERSON wrote it.\n\nDO NOT copy the topics, ideas, or content of these samples. They are STYLE EXAMPLES ONLY — the substrate they teach is HOW this person writes.\n═══════════════════════════════════════════════════════════════\n${lines.join('\n\n')}`
}
