/**
 * Surfacer — writes rows to `surfaced_cards` after an extraction run so the
 * Timeline feed + Console activity stream surface what just happened
 * automatically.
 *
 * Called from the workflow / DO right after the extraction run persists,
 * fire-and-forget. Errors are logged but never thrown: surfacing is a
 * best-effort affordance, not part of the pipeline contract.
 *
 * What it writes:
 *   subtype = 'new_evidence'  — for every strength-5 voice-grounded thread
 *                                ("the system noticed a strong take")
 *   subtype = 'cluster_ready' — when this vlog's extraction makes 3+
 *                                threads share the same abstracted_topic
 *                                ("a riff has formed")
 *
 * The surfaced_cards table's CHECK constraint only allows the documented
 * subtypes — schema.sql line 495. Stay inside that set.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { ulid } from './ulid'

interface SurfaceCtx {
  db: D1Database
  vlog_id: string
  operator_id: string
  run_id: string
}

interface ThreadShape {
  id: string
  topic?: string | null
  abstracted_topic?: string | null
  take?: string | null
  strength?: number | null
  validated?: number | null
}

/**
 * Insert surfaced_cards rows for the threads in this extraction run.
 * Idempotent enough: we don't dedupe against prior runs, but the
 * Timeline UI dismisses rows on click and the operator can ignore
 * duplicates. Future work: dedupe by (subtype, refs) pair.
 */
export async function surfaceFromRun(ctx: SurfaceCtx, threads: ThreadShape[]): Promise<{ inserted: number; errors: string[] }> {
  const inserted: string[] = []
  const errors: string[] = []

  // 1) Strong threads → 'new_evidence' (closest CHECK-allowed subtype for
  //    "the system extracted a high-strength take").
  const strong = threads.filter(t => (t.strength ?? 0) >= 5 && (t.validated ?? 1) === 1)
  for (const t of strong) {
    const id = ulid()
    const topic = t.abstracted_topic ?? t.topic ?? 'misc'
    const body = `Strong take: "${truncate(t.take ?? '', 240)}"`
    const refs = JSON.stringify({ vlog_id: ctx.vlog_id, thread_id: t.id, run_id: ctx.run_id })
    try {
      await ctx.db.prepare(
        `INSERT INTO surfaced_cards
           (id, operator_id, subtype, body, body_html, topic_color, refs)
         VALUES (?, ?, 'new_evidence', ?, ?, ?, ?)`,
      ).bind(id, ctx.operator_id, body, body, topic, refs).run()
      inserted.push(id)
    } catch (err: any) {
      errors.push(`new_evidence for thread ${t.id}: ${err?.message || err}`)
    }
  }

  // 2) Cluster-ready check — count threads sharing the same abstracted_topic
  //    across the operator's corpus. If ≥3, surface a cluster_ready card.
  //    We do this once per unique topic in THIS run to avoid spamming on
  //    re-extracts.
  const topics = new Set<string>()
  for (const t of threads) {
    const tp = (t.abstracted_topic ?? t.topic ?? '').toLowerCase().trim()
    if (tp) topics.add(tp)
  }
  for (const topic of topics) {
    try {
      const row = await ctx.db.prepare(
        `SELECT COUNT(*) AS n FROM threads
          WHERE operator_id = ? AND LOWER(abstracted_topic) = ? AND deleted_at IS NULL`,
      ).bind(ctx.operator_id, topic).first<{ n: number }>()
      const count = row?.n ?? 0
      if (count >= 3) {
        // Has a cluster_ready already been surfaced for this topic recently?
        // Cheap heuristic: skip if a surfaced_cards row exists for this
        // topic in the last 24h.
        const existing = await ctx.db.prepare(
          `SELECT 1 AS x FROM surfaced_cards
            WHERE operator_id = ? AND subtype = 'cluster_ready' AND topic_color = ?
              AND surfaced_at > datetime('now', '-24 hours')
            LIMIT 1`,
        ).bind(ctx.operator_id, topic).first<{ x: number }>()
        if (existing) continue

        const id = ulid()
        const body = `Cluster ready: ${count} threads now talk about "${topic}"`
        const refs = JSON.stringify({ topic, count })
        await ctx.db.prepare(
          `INSERT INTO surfaced_cards
             (id, operator_id, subtype, body, body_html, topic_color, refs)
           VALUES (?, ?, 'cluster_ready', ?, ?, ?, ?)`,
        ).bind(id, ctx.operator_id, body, body, topic, refs).run()
        inserted.push(id)
      }
    } catch (err: any) {
      errors.push(`cluster_ready for ${topic}: ${err?.message || err}`)
    }
  }

  return { inserted: inserted.length, errors }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}
