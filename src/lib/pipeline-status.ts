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

/**
 * Past this many bytes the browser-playback transcode is SKIPPED, not tried.
 *
 * ⚠️ 5 Nov — the operator: *"i have files over 10 gigs"*. Three files call
 * `/transcode-h264` — the DO's `stepTranscode`, the legacy workflow's
 * `transcode-h264` step and `/api/v2/admin/transcode-one` behind Settings'
 * *won't play* — so the number lives here rather than in three places. That
 * is this file's whole reason for existing: five copies of one pipeline fact,
 * two of them short, invisible to every check the repo has.
 *
 * Four things make the transcode impossible at that size, and all four
 * predate this constant:
 *
 *  - the container writes its input to local disk, and `downloadToTmp`
 *    refuses past 4 GB because `standard-1`'s disk is smaller than that plus
 *    an output;
 *  - ⚠️ TWO of the three callers read the finished MP4 into a WORKER with
 *    `arrayBuffer()` before putting it in R2 — the DO's `stepTranscode` and
 *    `/api/v2/admin/transcode-one` — and a Worker has ~128 MB of memory, so
 *    for those two the OUTPUT has always had to be small. That is a SEPARATE
 *    ceiling on a different quantity, it is written down nowhere else, and
 *    this constant does not fix it. The legacy workflow streams
 *    `ffmpegResp.body` straight into R2 and does not have it, which is the
 *    shape the other two should take if that ceiling is ever worth lifting;
 *  - it is a full-resolution `libx264 -crf 23` encode, and 4K on a half-vCPU
 *    instance is hours against a ten-minute abort and a twenty-minute kill;
 *  - a container bills for every second it is awake, so an attempt that
 *    cannot succeed costs a held gate slot and ten woken minutes — per
 *    restart, per file.
 *
 * ⚠️ Skipping is not free either, and the cost is stated rather than hidden:
 * `transcoded_r2_key` stays null, so `/vlog/[id]` plays the ORIGINAL, and
 * Chrome on Windows may not decode an HEVC one. The transcript, the
 * thumbnail and the headline are unaffected — this step has always been soft
 * for exactly that reason.
 */
export const TRANSCODE_MAX_BYTES = 4 * 1024 * 1024 * 1024

/** Why a recording cannot be made browser-playable, in words, or null. */
export function transcodeRefusal(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || bytes <= TRANSCODE_MAX_BYTES) return null
  const gb = (bytes / 1e9).toFixed(1)
  return `This recording is ${gb} GB. Making a second, browser-playable copy `
    + `means holding the whole file on one machine and re-encoding every `
    + `frame of it, and neither fits at this size. The recording itself is `
    + `kept untouched, and the words and the still are not affected — it just `
    + `plays from the original, which some browsers cannot decode.`
}
