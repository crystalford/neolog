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
 * ⚠️ 5 Nov — THE SHAPE CHANGED, and this comment is the shape.
 *
 * The operator: *"youtube i could probably upload any size file and have it
 * dependable and awesome as a video storage and upload tool. let's make it as
 * close to that as possible."* He was right, and the day before I had written
 * down four reasons a big recording could not have a playable copy as though
 * they were facts about the world. Three of the four were facts about one
 * wrong decision: **that the playable copy should be the master re-encoded at
 * its own resolution.**
 *
 * **Nothing plays the master.** That is what every video site does and it is
 * what this does now. `/transcode-proxy` reads the original over HTTP — so its
 * size never touches the container's disk — and writes a copy capped at
 * `PROXY_LONG_EDGE` on its long side. A 4K master becomes a few hundred
 * megabytes that plays in any browser, the master is never streamed to anyone,
 * and **the size of the input stops being a question**: a 10 GB recording
 * costs the same disk as a 100 MB one, which is none.
 *
 * So the three ceilings that were load-bearing yesterday are gone:
 *
 *  - the 4 GB disk limit — the input is not on disk;
 *  - the Worker's ~128 MB — the proxy is STREAMED into R2 rather than
 *    buffered with `arrayBuffer()`, so nothing caps the output either;
 *  - the full-resolution encode — it is a downscale, which is a fraction of
 *    the work.
 *
 * What remains is encode TIME, and that is bought rather than designed
 * around: `workers/ffmpeg/wrangler.toml` runs `standard-4` (4 vCPU) instead
 * of `standard-1` (1/2 vCPU). Memory and disk bill on the instance's
 * provisioned size for as long as it is awake and CPU bills only on use, so
 * the cost of this is roughly a dime an hour of wakefulness plus the CPU the
 * encodes actually burn — against a per-minute, forever fee for putting the
 * library in a hosted video product. That is the operator's money either way
 * and the comparison is in CLAUDE.md.
 */

/** The proxy's long side, in pixels. 1280 plays everywhere and seeks well. */
export const PROXY_LONG_EDGE = 1280

/**
 * How long the DO waits for one proxy.
 *
 * ⚠️ Not a guess at how long an encode takes — a bound on how long one
 * request may hold a container awake. The old value was ten minutes, chosen
 * when the step was a full-resolution encode that could never finish anyway.
 */
export const PROXY_REQUEST_MS = 40 * 60 * 1000

/**
 * The old full-resolution endpoint's ceiling, and ONLY that.
 *
 * ⚠️ `/transcode-h264` re-encodes at the source resolution and downloads its
 * input to the container's disk, so it still cannot take a file past this.
 * Nothing in the pipeline calls it any more — `stepTranscode` and the legacy
 * workflow both use `/transcode-proxy`, which has no size limit — and the two
 * callers that remain are the hand-operated ones: Settings' *won't play* and
 * the transcode backfill.
 *
 * ⚠️ So this is no longer "too big to have a playable copy". It is "too big
 * for the ONE endpoint that needs the whole file locally", and the answer for
 * such a file is the proxy, which `transcodeRefusal()` now says.
 */
export const TRANSCODE_MAX_BYTES = 4 * 1024 * 1024 * 1024

/**
 * Why the full-resolution transcode cannot take this file, in words, or null.
 *
 * ⚠️ A sentence and not a status code, because Settings' *won't play* is a
 * door he presses — and the answer it gave for a big recording used to be a
 * 500 with ffmpeg's stderr in it, several minutes later.
 */
export function transcodeRefusal(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || bytes <= TRANSCODE_MAX_BYTES) return null
  const gb = (bytes / 1e9).toFixed(1)
  return `This recording is ${gb} GB, which is too big to re-encode at its own `
    + `size — that needs the whole file on one machine. The playable copy is `
    + `made a different way, by the pipeline, and it is a smaller one: run `
    + `"wedged half-way" and it will be built without the original being `
    + `touched.`
}
