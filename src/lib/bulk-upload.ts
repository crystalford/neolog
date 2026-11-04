/**
 * Putting a big file in, reliably.
 *
 * ⚠️ 4 Nov — the operator, on trying to put thirty vlogs in: *"some of the
 * last uploads I tried failed… the post version is just annoying because I
 * have to drag them all and then post or whatever instead of just uploading
 * them like any normal site would have."*
 *
 * Both halves of that were true and they were two different bugs.
 *
 * ── What was wrong ───────────────────────────────────────────────────────
 *
 * **The composer did a single PUT of the whole file.** `useIntake`'s attach
 * presigned one URL and did `fetch(url, { method: 'PUT', body: file })`. For
 * a 1.2 GB recording that is one request that has to survive twenty minutes.
 * No progress, no retry, no resume, and when it died the entry said
 * `upload failed` and nothing else. That is the path he was on.
 *
 * **`CapturePanel` did it properly and still had a clock on it.** Real
 * multipart with per-part retry — but it presigned EVERY part up front with
 * a one-hour TTL, so the clock on part 25 started before part 1 had moved a
 * byte. On a slow upstream the later parts expire mid-flight and come back
 * 403. And one failed part failed the whole file, from zero, with a
 * gigabyte already sent.
 *
 * ── What this does instead ───────────────────────────────────────────────
 *
 * - **Parts are presigned a window at a time**, just before they are used,
 *   so a URL is never old when it is spent. The TTL question goes away
 *   rather than being tuned.
 * - **A part that fails is retried; a FILE that fails is resumable.** Every
 *   accepted part's number and ETag go in a ledger in `localStorage`, keyed
 *   by the file's own name, size and mtime. Re-add the same file — after a
 *   reload, a crash, a closed laptop — and only the missing parts are sent.
 *   R2 keeps an incomplete multipart upload for **seven days**, which is the
 *   window this is good for.
 * - **The file is never read whole.** Only `Blob.slice()`, one part at a
 *   time. The old composer path called `arrayBuffer()` on files up to 50 MB
 *   and a bulk drop of photos could allocate a gigabyte before anything
 *   finished.
 *
 * ⚠️ **R2 requires every part except the last to be the SAME size.** Not an
 * S3-ism to be clever about — R2 rejects a mixed-size upload at complete,
 * after everything has been sent. So the size is computed once, stored in
 * the ledger, and reused on resume rather than recomputed.
 *
 * ⚠️ **The Workers R2 binding has no ListParts.** `resumeMultipartUpload`
 * gives `.complete()` and `.abort()` and nothing that asks R2 what it
 * already holds. So the ledger is ours, not R2's — which is fine, because
 * the ETags `complete` needs are exactly what we recorded. If the ledger has
 * gone stale against R2 the complete is rejected, and that file starts again
 * with the ledger dropped and the reason said out loud.
 */

export type JobStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'finishing'
  | 'done'
  | 'failed'
  | 'paused'

export interface UploadJob {
  id: string
  file: File
  name: string
  size: number
  status: JobStatus
  /** Bytes R2 has accepted. Not bytes handed to fetch. */
  sent: number
  /** Bytes per second over the last few parts, or null before the first. */
  rate: number | null
  error: string | null
  /** True when the ledger had parts in it — the row says "resumed". */
  resumed: boolean
  /** Set once the recording row exists. */
  vlogId: string | null
  key: string | null
}

/** R2's floor is 5 MiB. Eight gives finer progress and cheap retries. */
const MIN_PART = 8 * 1024 * 1024

/**
 * Aim for no more than this many parts.
 *
 * R2's ceiling is 10,000, so this is not the limit — it is a choice about
 * how much work a single failure throws away against how many requests a
 * file costs. Two hundred 8 MiB parts covers 1.6 GB; past that the part size
 * grows rather than the count.
 */
const TARGET_PARTS = 200

/** How many part URLs to presign at once. */
const PRESIGN_WINDOW = 8

/** Parts in flight for one file. A browser gives about six per origin. */
const PART_CONCURRENCY = 4

/** Files uploading at once. The rest queue. */
export const FILE_CONCURRENCY = 2

const PART_RETRIES = 5
const PART_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Uniform, and derived only from the size — so resuming the same file
 * computes the same number without consulting anything.
 */
export function partSizeFor(bytes: number): number {
  const wanted = Math.ceil(bytes / TARGET_PARTS)
  if (wanted <= MIN_PART) return MIN_PART
  // Round up to a whole MiB so the number is a readable one in a ledger.
  return Math.ceil(wanted / (1024 * 1024)) * 1024 * 1024
}

// ── The ledger ────────────────────────────────────────────────────────────

interface Ledger {
  uploadId: string
  key: string
  partSize: number
  /** Only parts R2 accepted, with the ETag it gave back. */
  parts: { partNumber: number; etag: string }[]
  startedAt: number
}

/**
 * ⚠️ Keyed by the file's own identity, not by anything we assign. The
 * browser cannot hold a `File` across a reload — a handle is not
 * serialisable — so resuming means he picks the same file again and we have
 * to recognise it. Name, size and mtime together are enough: a different
 * recording will not collide on all three.
 */
function ledgerKey(file: File): string {
  return `neolog.upload.${file.name}:${file.size}:${file.lastModified}`
}

/** R2 drops an incomplete multipart upload after seven days. */
const LEDGER_TTL_MS = 7 * 24 * 3600 * 1000

function readLedger(file: File): Ledger | null {
  try {
    const raw = localStorage.getItem(ledgerKey(file))
    if (!raw) return null
    const l = JSON.parse(raw) as Ledger
    if (!l?.uploadId || !l?.key || !l?.partSize) return null
    // Past R2's own window the uploadId is gone and the parts with it.
    if (Date.now() - (l.startedAt || 0) > LEDGER_TTL_MS) {
      localStorage.removeItem(ledgerKey(file))
      return null
    }
    return l
  } catch { return null }
}

function writeLedger(file: File, l: Ledger): void {
  // ⚠️ Never fatal. localStorage throws in private mode and when it is full,
  // and a failed resume is a slower upload — not a failed one.
  try { localStorage.setItem(ledgerKey(file), JSON.stringify(l)) } catch {}
}

function dropLedger(file: File): void {
  try { localStorage.removeItem(ledgerKey(file)) } catch {}
}

// ── One part ──────────────────────────────────────────────────────────────

async function putPart(
  url: string,
  blob: Blob,
  signal: AbortSignal,
): Promise<string> {
  let last = ''
  for (let attempt = 1; attempt <= PART_RETRIES; attempt++) {
    if (signal.aborted) throw new Error('paused')
    const ctrl = new AbortController()
    const onAbort = () => ctrl.abort()
    signal.addEventListener('abort', onAbort)
    const timer = setTimeout(() => ctrl.abort(), PART_TIMEOUT_MS)
    try {
      const res = await fetch(url, { method: 'PUT', body: blob, signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const etag = res.headers.get('ETag')?.replace(/"/g, '') || ''
      if (!etag) throw new Error('no ETag')
      return etag
    } catch (err: any) {
      if (signal.aborted) throw new Error('paused')
      last = err?.name === 'AbortError' ? 'timed out' : (err?.message || String(err))
      // ⚠️ A 403 here is almost always an expired URL, and the window is
      // re-presigned by the caller on the next pass rather than retried
      // against the same dead URL.
      if (last.includes('403')) throw new Error('url expired')
      if (attempt < PART_RETRIES) {
        await new Promise(r => setTimeout(r, Math.min(30_000, 2 ** attempt * 500)))
      }
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }
  throw new Error(last || 'part failed')
}

// ── One file ──────────────────────────────────────────────────────────────

export interface UploadCallbacks {
  onChange: (patch: Partial<UploadJob>) => void
  signal: AbortSignal
}

/**
 * Send one file and register it as a recording.
 *
 * Resolves when the recording row exists. Throws with a sentence that says
 * what happened — every failure path here ends up in front of him on the
 * row, so "upload failed" is not an acceptable message.
 */
export async function uploadOne(
  file: File,
  cb: UploadCallbacks,
): Promise<{ vlogId: string; key: string }> {
  const { onChange, signal } = cb

  // ── Is it already in? ──────────────────────────────────────────────────
  //
  // ⚠️ Before a byte moves. A bulk drop is the case where this matters: he
  // re-drops a folder, and without this the log takes thirty recordings it
  // already holds and he pays for the bandwidth twice. Same
  // `(filename, size)` heuristic `POST /api/v2/vlogs` uses for its own 409,
  // asked up front rather than after the upload.
  //
  // A failure here is not a reason to stop — the worst case is an upload
  // that the register step then refuses, which is where it would have ended
  // up anyway.
  try {
    const q = new URLSearchParams({ filename: file.name, size: String(file.size) })
    const res = await fetch(`/api/v2/vlogs/duplicate-check?${q}`, { credentials: 'include' })
    if (res.ok) {
      const j = await res.json() as { exists?: boolean; existing_id?: string }
      if (j.exists && j.existing_id) {
        dropLedger(file)
        onChange({ status: 'done', sent: file.size, vlogId: j.existing_id, resumed: false })
        return { vlogId: j.existing_id, key: '' }
      }
    }
  } catch { /* ask again at register time */ }

  // ── Where we are, if we have been here before ──────────────────────────
  let ledger = readLedger(file)
  const partSize = ledger?.partSize ?? partSizeFor(file.size)
  const totalParts = Math.max(1, Math.ceil(file.size / partSize))

  if (!ledger) {
    onChange({ status: 'preparing' })
    const res = await fetch('/api/v2/upload/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        partSize,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`could not start the upload (${res.status}) ${body}`.trim())
    }
    const j = await res.json() as { uploadId: string; key: string }
    ledger = {
      uploadId: j.uploadId, key: j.key, partSize,
      parts: [], startedAt: Date.now(),
    }
    writeLedger(file, ledger)
  } else {
    onChange({ resumed: ledger.parts.length > 0 })
  }

  const done = new Map<number, string>(ledger.parts.map(p => [p.partNumber, p.etag]))
  onChange({
    status: 'uploading',
    key: ledger.key,
    sent: Math.min(file.size, done.size * partSize),
  })

  // ── The parts that are left ────────────────────────────────────────────
  const todo: number[] = []
  for (let n = 1; n <= totalParts; n++) if (!done.has(n)) todo.push(n)

  /**
   * Presigned URLs for a window of part numbers.
   *
   * ⚠️ Fetched as they are needed rather than all at once. Presigning part
   * two hundred before part one has moved starts its clock a long way from
   * when it is spent, which is how the old path handed back 403s on a slow
   * connection.
   */
  const urls = new Map<number, string>()
  const presign = async (numbers: number[]): Promise<void> => {
    const want = numbers.filter(n => !urls.has(n))
    if (!want.length) return
    const res = await fetch('/api/v2/upload/parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key: ledger!.key, uploadId: ledger!.uploadId, parts: want }),
    })
    if (!res.ok) throw new Error(`could not get upload URLs (${res.status})`)
    const j = await res.json() as { urls: { partNumber: number; url: string }[] }
    for (const u of j.urls) urls.set(u.partNumber, u.url)
  }

  let sent = done.size * partSize
  let cursor = 0
  let failure: string | null = null
  const recent: { at: number; bytes: number }[] = []

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal.aborted || failure) return
      const idx = cursor++
      if (idx >= todo.length) return
      const n = todo[idx]

      try {
        if (!urls.has(n)) await presign(todo.slice(idx, idx + PRESIGN_WINDOW))
        const url = urls.get(n)
        if (!url) throw new Error(`no URL for part ${n}`)

        const start = (n - 1) * partSize
        const blob = file.slice(start, Math.min(start + partSize, file.size))
        let etag: string
        try {
          etag = await putPart(url, blob, signal)
        } catch (err: any) {
          // A dead URL is re-minted once and the part tried again, because
          // the bytes are fine and only the signature went stale.
          if (String(err?.message) !== 'url expired') throw err
          urls.delete(n)
          await presign([n])
          const fresh = urls.get(n)
          if (!fresh) throw new Error(`no URL for part ${n}`)
          etag = await putPart(fresh, blob, signal)
        }

        done.set(n, etag)
        sent = Math.min(file.size, sent + blob.size)

        // The ledger is written after EVERY part, not at the end. The whole
        // point is surviving the thing that stops the upload.
        ledger!.parts = [...done].map(([partNumber, e]) => ({ partNumber, etag: e }))
        writeLedger(file, ledger!)

        const now = Date.now()
        recent.push({ at: now, bytes: blob.size })
        while (recent.length > 6) recent.shift()
        const span = (now - recent[0].at) / 1000
        const rate = span > 0.5
          ? recent.reduce((a, r) => a + r.bytes, 0) / span
          : null

        onChange({ sent, rate })
      } catch (err: any) {
        if (signal.aborted) return
        failure = err?.message || String(err)
        return
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PART_CONCURRENCY, Math.max(1, todo.length)) }, worker),
  )

  if (signal.aborted) throw new Error('paused')
  if (failure) throw new Error(failure)

  // ── Seal it ────────────────────────────────────────────────────────────
  onChange({ status: 'finishing', sent: file.size })
  const parts = [...done]
    .map(([partNumber, etag]) => ({ partNumber, etag }))
    .sort((a, b) => a.partNumber - b.partNumber)

  const fin = await fetch('/api/v2/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ uploadId: ledger.uploadId, key: ledger.key, parts }),
  })
  if (!fin.ok) {
    // ⚠️ A rejected complete means our ledger disagrees with what R2 holds —
    // a part it never got, or an upload it has since dropped. The ledger is
    // the thing that is wrong, so it goes, and the next attempt is a clean
    // one rather than the same disagreement again.
    dropLedger(file)
    const body = await fin.text().catch(() => '')
    throw new Error(
      `the upload could not be sealed (${fin.status}). What was sent has been `
      + `discarded and this file will start over. ${body}`.trim(),
    )
  }

  // ── Register it as a recording ─────────────────────────────────────────
  const reg = await fetch('/api/v2/vlogs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      r2_key: ledger.key,
      original_filename: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || 'video/mp4',
      // ⚠️ Queued, not dispatched. A bulk drop that dispatches every file at
      // once is what wedged the September corpus run; `drainUploadQueue`
      // hands them over three at a time.
      queue: true,
    }),
  })
  if (!reg.ok) {
    const body = await reg.text().catch(() => '')
    throw new Error(
      `the file is in storage but the log could not record it (${reg.status}). `
      + `Nothing is lost — try again. ${body}`.trim(),
    )
  }
  const { id } = await reg.json() as { id: string }

  // It is R2's now, and the ledger has nothing left to protect.
  dropLedger(file)
  return { vlogId: id, key: ledger.key }
}

// ── Saying it in words ────────────────────────────────────────────────────

export function humanBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${Math.max(1, Math.round(n / 1e3))} KB`
}

/** "about 4 minutes left" — or nothing, when there is nothing to say. */
export function humanLeft(remaining: number, rate: number | null): string | null {
  if (!rate || rate <= 0 || remaining <= 0) return null
  const s = remaining / rate
  if (s < 45) return 'less than a minute left'
  const m = Math.round(s / 60)
  if (m < 60) return `about ${m} minute${m === 1 ? '' : 's'} left`
  const h = Math.floor(m / 60)
  return `about ${h} hour${h === 1 ? '' : 's'} left`
}
