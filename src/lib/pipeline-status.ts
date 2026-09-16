/**
 * `vlogs.pipeline_status` — the one list, in one place.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * Five files declared their own copy of "what counts as in flight", and on
 * 9 Sep two of them were wrong in the same way: `workers/healer` and
 * `/api/v2/admin/reset-stuck` both omitted **`reading`**, the pipeline's last
 * step since the read path replaced extraction on 8 Sep.
 *
 * ⚠️ The healer is the only thing that makes a four-hundred-recording run
 * self-recover, and it could not see a recording wedged in its final step. A
 * recording that hung on the way onto the log stayed hung, forever, and
 * nothing anywhere reported it: `tsc` is happy with a string array,
 * `check-sql-columns.mjs` sees a legal column, and `check-enum-values.mjs`
 * sees legal values. Every list was internally valid and one was short.
 *
 * So the list is exported and imported, the way `RELATIONS` is in
 * `log-entry.ts`, and for the same reason: a wrong value here is invisible
 * to every check the repo has.
 */

/** Work is underway inside the pipeline right now. */
export const IN_FLIGHT_STATUSES = [
  'transcoding',
  'transcribing',
  'extracting',   // the DO's name for its last step; `stepRead` runs there
  'reading',      // ⚠️ the one that was missing from two of five copies
] as const

/**
 * Dispatched and not yet started.
 *
 * ⚠️ Separate from `IN_FLIGHT_STATUSES` on purpose, because the two answer
 * different questions. A row sits at `uploaded` while the browser is still
 * pushing a gigabyte to R2, so a job that RE-DISPATCHES a stuck row must not
 * include it — that turns a slow upload into a broken one. A job that
 * REPORTS what is in flight, or terminates everything, should.
 */
export const DISPATCHED_STATUS = 'uploaded' as const

/** In flight, plus dispatched-not-started. For reporting and for kill. */
export const OCCUPIED_STATUSES = [...IN_FLIGHT_STATUSES, DISPATCHED_STATUS] as const

export type PipelineStatus =
  | typeof IN_FLIGHT_STATUSES[number]
  | typeof DISPATCHED_STATUS
  | 'complete'
  | 'failed'
  | 'archived'

/**
 * The list as a SQL `IN (…)` body: `'a','b','c'`.
 *
 * Safe to interpolate — every value is a literal in this file and none is
 * caller input. Written as a helper so a query cannot quietly hold a fourth
 * copy of the list, which is the whole failure this file exists to stop.
 */
export function statusList(statuses: readonly string[]): string {
  return statuses.map(s => `'${s}'`).join(',')
}
