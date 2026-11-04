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
  /** Already in the log, so nothing was sent. The row says so. */
  skipped: boolean
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

/**
 * Parts in flight for one file.
 *
 * ⚠️ Three, not four, because `FILE_CONCURRENCY` is two and a browser
 * opens about six connections per origin. At four the eighth request sits in
 * the browser's own queue doing nothing, which buys no throughput and makes
 * the per-file rate reading lie — a part that has not started looks like a
 * part that is going slowly.
 */
const PART_CONCURRENCY = 3

/** Files uploading at once. The rest queue. */
export const FILE_CONCURRENCY = 2

const PART_RETRIES = 5
const PART_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Wait for the connection to come back rather than spending retries on it.
 *
 * ⚠️ Without this, two minutes offline is fatal. Five retries with
 * exponential backoff is about a minute of trying, so a dropped wifi link, a
 * train tunnel or a laptop waking up burns every attempt and marks the file
 * failed — and then it sits there until he notices and presses something.
 * That is the "I tried it and it failed" he is describing, produced by a
 * blip he never saw.
 *
 * ⚠️ `navigator.onLine` is a hint and not a fact: it reports true for a
 * router with no internet behind it. So it is only ever used to decide
 * whether to WAIT — never to decide that a request would have succeeded.
 * When it says offline we hold; when it says online we still retry normally.
 */
async function waitForOnline(signal: AbortSignal): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return
  await new Promise<void>(resolve => {
    const done = () => {
      window.removeEventListener('online', done)
      signal.removeEventListener('abort', done)
      clearInterval(poll)
      resolve()
    }
    // The event is the fast path; the poll is because `online` does not
    // always fire on every platform when a sleeping machine wakes up.
    const poll = setInterval(() => { if (navigator.onLine) done() }, 3000)
    window.addEventListener('online', done)
    signal.addEventListener('abort', done)
  })
}

/**
 * A JSON call to our own Worker, retried.
 *
 * ⚠️ `/parts` and `/complete` had no retry at all, so one 500 or one
 * dropped request killed a file that was 90% uploaded. A 4xx is kept as a
 * real answer — it means the request was wrong and repeating it will not
 * help — and everything else is treated as weather.
 */
async function callJson(
  url: string,
  body: unknown,
  signal: AbortSignal,
  attempts = 4,
): Promise<Response> {
  let last = ''
  for (let i = 1; i <= attempts; i++) {
    if (signal.aborted) throw new Error('paused')
    await waitForOnline(signal)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal,
      })
      // A refusal is an answer. Only a server fault is worth repeating.
      if (res.status < 500) return res
      last = `HTTP ${res.status}`
    } catch (err: any) {
      if (signal.aborted) throw new Error('paused')
      last = err?.message || String(err)
    }
    if (i < attempts) await new Promise(r => setTimeout(r, Math.min(20_000, 2 ** i * 700)))
  }
  throw new Error(last || 'no answer from the server')
}

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
  /**
   * The multipart upload has been sealed and the object exists in R2.
   *
   * ⚠️ Without this, a file whose bytes all landed and whose REGISTRATION
   * then failed — a 500 from D1, a dropped request — would on retry call
   * `complete` a second time against an uploadId R2 has already finished.
   * R2 refuses that, the refusal reads as "our ledger is wrong", and 1.2 GB
   * that is safely in storage gets uploaded again from part one.
   *
   * Set the moment `complete` returns, so a retry goes straight to
   * registering the row it could not register the first time.
   */
  completed?: boolean
}

/**
 * ⚠️ Keyed by the file's own identity, not by anything we assign. The
 * browser cannot hold a `File` across a reload — a handle is not
 * serialisable — so resuming means he picks the same file again and we have
 * to recognise it. Name, size and mtime together are enough: a different
 * recording will not collide on all three.
 */
const LEDGER_PREFIX = 'neolog.upload.'

function ledgerKey(file: File): string {
  return `${LEDGER_PREFIX}${file.name}:${file.size}:${file.lastModified}`
}

/**
 * ⚠️ The same file, when its modified time has moved.
 *
 * `lastModified` is not as stable as it looks: copying a folder, syncing it,
 * restoring it from a backup or pulling it off a different device can all
 * rewrite it, and some pickers report the time the file was READ. When it
 * moves, the exact key misses and a 1.2 GB upload silently starts from zero
 * — which looks exactly like the resume not working.
 *
 * So a miss falls back to name and size, which is the same pair the
 * duplicate check uses to decide two files are the same recording. If that
 * pair is good enough to skip an upload entirely it is good enough to
 * resume one.
 */
function ledgerKeyLoose(file: File): string {
  return `${LEDGER_PREFIX}${file.name}:${file.size}:`
}

/** R2 drops an incomplete multipart upload after seven days. */
const LEDGER_TTL_MS = 7 * 24 * 3600 * 1000

function readLedger(file: File): Ledger | null {
  const fresh = (raw: string | null, key: string): Ledger | null => {
    if (!raw) return null
    try {
      const l = JSON.parse(raw) as Ledger
      if (!l?.uploadId || !l?.key || !l?.partSize) return null
      // Past R2's own window the uploadId is gone and the parts with it.
      if (Date.now() - (l.startedAt || 0) > LEDGER_TTL_MS) {
        localStorage.removeItem(key)
        return null
      }
      return l
    } catch { return null }
  }

  try {
    const exact = ledgerKey(file)
    const hit = fresh(localStorage.getItem(exact), exact)
    if (hit) return hit

    // ⚠️ Then the same name and size under a different mtime. See
    // `ledgerKeyLoose`.
    const prefix = ledgerKeyLoose(file)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(prefix)) continue
      const l = fresh(localStorage.getItem(k), k)
      if (l) return l
    }
  } catch { /* private mode, or storage is full */ }
  return null
}

/**
 * Forget the ledgers R2 has already forgotten.
 *
 * ⚠️ A ledger is only ever expired when the SAME file is offered again, so
 * one for a file he never re-adds sits there indefinitely. Harmless on its
 * own, and a browser that refuses a write because the quota is full is not —
 * that is how the ledger stops being written mid-upload and the resume this
 * whole design rests on quietly stops happening.
 */
export function sweepLedgers(): void {
  try {
    const dead: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(LEDGER_PREFIX)) continue
      try {
        const l = JSON.parse(localStorage.getItem(k) || '{}') as Ledger
        if (Date.now() - (l.startedAt || 0) > LEDGER_TTL_MS) dead.push(k)
      } catch { dead.push(k) }
    }
    for (const k of dead) localStorage.removeItem(k)
  } catch { /* nothing to sweep if storage is unreadable */ }
}

/**
 * Files that were part-way through and never finished.
 *
 * ⚠️ The browser cannot hold a `File` across a reload, so this cannot
 * resume them — only SAY they exist. That is most of the value: the
 * difference between "it failed" and "it is waiting for you to add it
 * again" is whether anything says so.
 */
export function unfinished(): { name: string; parts: number; at: number }[] {
  const out: { name: string; parts: number; at: number }[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(LEDGER_PREFIX)) continue
      try {
        const l = JSON.parse(localStorage.getItem(k) || '{}') as Ledger
        if (!l?.uploadId || Date.now() - (l.startedAt || 0) > LEDGER_TTL_MS) continue
        const name = k.slice(LEDGER_PREFIX.length).split(':')[0]
        out.push({ name, parts: l.parts?.length || 0, at: l.startedAt || 0 })
      } catch { /* a ledger we cannot read is one we cannot report */ }
    }
  } catch { /* storage unreadable */ }
  return out.sort((a, b) => b.at - a.at)
}

function writeLedger(file: File, l: Ledger): void {
  // ⚠️ Never fatal. localStorage throws in private mode and when it is full,
  // and a failed resume is a slower upload — not a failed one.
  try { localStorage.setItem(ledgerKey(file), JSON.stringify(l)) } catch {}
}

function dropLedger(file: File): void {
  // ⚠️ Both forms. A ledger found by the loose key and removed only by the
  // exact one would be re-found on the next drop and resume an upload that
  // has already been registered.
  try {
    localStorage.removeItem(ledgerKey(file))
    const prefix = ledgerKeyLoose(file)
    const dead: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) dead.push(k)
    }
    for (const k of dead) localStorage.removeItem(k)
  } catch {}
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
    // ⚠️ Held, not spent. See `waitForOnline`.
    await waitForOnline(signal)
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

/**
 * Which of these the log already holds — asked once, for the whole drop.
 *
 * ⚠️ 4 Nov. The operator: *"some of the files I will be uploading have
 * already been uploaded… because some failed I have to just drag the whole
 * folder again as I'm not sure which ones failed."* That is the real
 * workflow and it is the one to optimise: a folder goes in, the ones already
 * there say so, and only the rest move bytes.
 *
 * Asked BEFORE anything uploads, and asked for all of them at once. A
 * per-file check inside each upload is gated behind `FILE_CONCURRENCY`, so
 * the thirtieth file is not asked about until twenty-eight ahead of it have
 * finished — he would watch a queue work through files it was going to skip.
 *
 * ⚠️ A failure here is not a reason to stop. The worst case is a file that
 * uploads and is then refused at registration with a 409, which `uploadOne`
 * already treats as the recording being in. Slower, never wrong.
 */
export async function alreadyIn(
  files: File[],
): Promise<(({ id: string; status: string }) | null)[]> {
  if (!files.length) return []
  try {
    // ⚠️ On a clock. This runs BEFORE anything uploads, so a slow or dead
    // answer would hold the whole drop at the gate — a stall that looks
    // exactly like the uploader not working. Five seconds, then start
    // anyway: a duplicate that gets through is caught by the 409 at
    // registration, which `uploadOne` treats as the recording being in.
    const res = await fetch('/api/v2/vlogs/duplicate-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ files: files.map(f => ({ name: f.name, size: f.size })) }),
    })
    if (!res.ok) return files.map(() => null)
    const j = await res.json() as { known?: (({ id: string; status: string }) | null)[] }
    const known = j.known || []
    return files.map((_, i) => known[i] ?? null)
  } catch {
    return files.map(() => null)
  }
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

  if (!ledger.completed) {
    const fin = await callJson(
      '/api/v2/upload/complete',
      { uploadId: ledger.uploadId, key: ledger.key, parts },
      signal,
    )
    if (!fin.ok) {
      const body = await fin.text().catch(() => '')
      // ⚠️ A 4xx means OUR LEDGER disagrees with what R2 holds — a part
      // it never got, or an upload it has since dropped. That is the one
      // case where starting over is right, so the ledger goes.
      //
      // ⚠️ Anything else is weather. `callJson` has already retried a 5xx
      // four times; discarding the ledger here would throw away a gigabyte
      // that is sitting in R2 intact because a request did not land. The
      // first version of this did exactly that for every failure, which is
      // the worst bug I put in this file.
      if (fin.status >= 400 && fin.status < 500) {
        dropLedger(file)
        throw new Error(
          `the upload could not be sealed (${fin.status}). What was sent has `
          + `been discarded and this file will start over. ${body}`.trim(),
        )
      }
      throw new Error(
        `the upload could not be sealed just now (${fin.status}). Everything `
        + `already sent is kept — try again and it picks up from here. ${body}`.trim(),
      )
    }
    // Written before anything else can fail. See `Ledger.completed`.
    ledger.completed = true
    writeLedger(file, ledger)
  }

  // ── Register it as a recording ─────────────────────────────────────────
  const reg = await callJson('/api/v2/vlogs', {
    r2_key: ledger.key,
    original_filename: file.name,
    file_size_bytes: file.size,
    mime_type: file.type || 'video/mp4',
    // ⚠️ Queued, not dispatched. A bulk drop that dispatches every file at
    // once is what wedged the September corpus run; `drainUploadQueue`
    // hands them over three at a time.
    queue: true,
  }, signal)

  // ⚠️ 409 is not a failure here. `POST /api/v2/vlogs` answers it when a row
  // with the same name and size already exists — which is exactly what a
  // re-drop of a folder produces when the batch check raced, or when the
  // registration landed and its RESPONSE did not. The recording is in
  // either way, and treating that as an error would show a red row for a
  // file the log holds.
  if (reg.status === 409) {
    const body = await reg.json().catch(() => ({})) as { existing_id?: string; id?: string }
    const existing = body.existing_id || body.id
    if (existing) {
      dropLedger(file)
      return { vlogId: existing, key: ledger.key }
    }
  }

  if (!reg.ok) {
    const body = await reg.text().catch(() => '')
    throw new Error(
      `the file is in storage but the log could not record it (${reg.status}). `
      + `Nothing is lost — try again and it goes straight to this step. ${body}`.trim(),
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
