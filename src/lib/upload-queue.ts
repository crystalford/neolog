/**
 * The upload queue — fifty recordings arrive, a few go through at a time.
 *
 * ⚠️ 20 Sep. The operator, asked what should happen when he bulk-drops fifty
 * clips: *"i think they should be transcribed later. but i don't want to
 * have to manually trigger transcription. that is too much work. they should
 * be maybe queued .. so that we get no failures."*
 *
 * Both halves of that matter, and the September corpus run is why:
 *
 * - **Not all at once.** Dispatching four hundred recordings together is
 *   exactly what produced the alarm-chain drops, the container filling its
 *   disk, and the R2 read-after-write failures recorded in CLAUDE.md. The
 *   pipeline is fine one at a time and unreliable in a herd.
 * - **Not by hand either.** "Transcribe the untranscribed" in Settings
 *   exists and works, and requiring it after every drop is the work he is
 *   asking not to do.
 *
 * So a recording lands, waits, and is handed over when there is room.
 *
 * ── How a waiting recording is recognised ───────────────────────────────
 *
 * It sits at `pipeline_status = 'uploaded'` with `dispatched_at IS NULL`.
 *
 * The status is deliberately NOT a new value. `pipelineLine` in `feed.ts`
 * already reads `uploaded` as *"Just arrived. Nothing read yet."*, which is
 * precisely true of something in this queue — and CLAUDE.md records what
 * happens when a status nothing recognises gets written: **Start again**
 * wrote `pending` once and four hundred recordings rendered with no state
 * line at all. A fifth copy of the status taxonomy is the bug this repo
 * keeps finding; a column that means one thing is not.
 *
 * `archived` is also wrong for this and is left alone: it means *"Kept, not
 * read — you asked for it that way"*, an instruction not to process. These
 * recordings are waiting to be processed.
 *
 * ── Why the cap is three ────────────────────────────────────────────────
 *
 * `workers/ffmpeg`'s `FFmpegGate` admits three concurrent `/extract-audio`
 * calls against one container, and the container worker runs
 * `max_instances = 5`. Three in flight keeps the whole run inside the gate
 * rather than relying on it to queue, which is what 503s instance six.
 */

import { findMany, findOne, run } from './d1'
import { dispatchPipeline, type DispatchEnv } from './dispatch-pipeline'
import { IN_FLIGHT_STATUSES, statusList } from './pipeline-status'
import type { D1Database } from '@cloudflare/workers-types'

/** How many recordings may be moving through the pipeline at once. */
export const QUEUE_CONCURRENCY = 3

export interface QueueCounts {
  /** Registered, waiting, never handed over. */
  waiting: number
  /** Handed over and somewhere in the pipeline. */
  in_flight: number
}

export async function queueCounts(db: D1Database, operatorId: string): Promise<QueueCounts> {
  const r = await findOne<{ waiting: number; in_flight: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM vlogs
         WHERE operator_id = ?1 AND deleted_at IS NULL
           AND pipeline_status = 'uploaded' AND dispatched_at IS NULL) AS waiting,
       (SELECT COUNT(*) FROM vlogs
         WHERE operator_id = ?1 AND deleted_at IS NULL
           AND pipeline_status IN (${statusList(IN_FLIGHT_STATUSES)})) AS in_flight`,
    operatorId,
  )
  return { waiting: r?.waiting || 0, in_flight: r?.in_flight || 0 }
}

/**
 * Hand over as many as there is room for, oldest first, and stop.
 *
 * Safe to call from anywhere and as often as anything likes: it dispatches
 * only up to the gap under the cap, and marks each row before it returns so
 * a second call a moment later cannot send the same recording twice.
 *
 * Returns what it did, so a caller can say so out loud rather than implying
 * something moved.
 */
export async function drainUploadQueue(
  env: DispatchEnv,
  db: D1Database,
  operatorId: string,
): Promise<{ dispatched: number; waiting: number; in_flight: number }> {
  const counts = await queueCounts(db, operatorId)
  const room = QUEUE_CONCURRENCY - counts.in_flight
  if (room <= 0 || counts.waiting === 0) {
    return { dispatched: 0, ...counts }
  }

  const next = await findMany<{ id: string }>(
    db,
    `SELECT id FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        AND pipeline_status = 'uploaded' AND dispatched_at IS NULL
      ORDER BY created_at ASC
      LIMIT ?`,
    operatorId, room,
  )

  let dispatched = 0
  for (const row of next) {
    // Marked BEFORE the dispatch, not after. A dispatch that throws leaves
    // the row marked and out of the queue, which is the safe direction: the
    // healer and "transcribe the untranscribed" both still pick it up, and
    // the alternative is a row that fails and is retried forever by every
    // page visit.
    await run(
      db,
      `UPDATE vlogs SET dispatched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ? AND dispatched_at IS NULL`,
      row.id, operatorId,
    )
    // ⚠️ `useStart` is not optional here. Without it `dispatchPipeline`
    // sends `/reextract`, which begins at the read step and **never calls
    // Whisper** — the exact bug recorded against `reprocess-vlogs` on
    // 17 Sep, where hundreds of recordings reached `complete` having
    // transcribed nothing. Everything in this queue is a file that has just
    // arrived and has no transcript at all, so it needs the full pipeline
    // from `audio_extract`.
    const res = await dispatchPipeline(env, {
      vlog_id: row.id, operator_id: operatorId, useStart: true,
    })
    if (res.ok) {
      dispatched++
    } else {
      await run(
        db,
        `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND operator_id = ?`,
        res.error || 'dispatch failed', row.id, operatorId,
      )
    }
  }

  const after = await queueCounts(db, operatorId)
  return { dispatched, ...after }
}
