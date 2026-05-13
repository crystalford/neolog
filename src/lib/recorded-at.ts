/**
 * Recording-date derivation — the LOCKED four-tier fallback, lifted into a
 * shared module so both the registration API (src/app/api/v2/vlogs/route.ts)
 * and the post-upload Workflow (workers/process-upload/src/workflow.ts) can
 * use it.
 *
 * Order:
 *   1. pre_extracted — client passed `recorded_at` (filename inference at
 *      capture time). Already a valid ISO timestamp.
 *   2. mvhd          — MP4 mvhd-atom creation time. Fetches the first 2 MB
 *                      of the R2 object with an HTTP Range request.
 *   3. filename      — server-side filename regex (broader set than client).
 *   4. upload_time_default — falls back to now-ish (caller decides what to
 *                            store; typically NULL until the workflow's
 *                            safety-net re-runs).
 *
 * Returns `{ recorded_at, recorded_at_source }` with `recorded_at` ISO 8601
 * (UTC) string or null when no source produced a value, and
 * `recorded_at_source` one of the documented enum values.
 *
 * The MP4 mvhd parsing is byte-for-byte the same as workers/process-upload/
 * src/workflow.ts lines 444-490; do not edit those independently — port any
 * change here.
 */
import { presignGetUrl, type R2Env } from './r2'

export type RecordedAtSource =
  | 'pre_extracted'
  | 'mvhd'
  | 'filename'
  | 'upload_time_default'

const MP4_EPOCH_OFFSET_SEC = 2082844800 // seconds between 1904-01-01 and 1970-01-01

export interface DeriveInput {
  /** Optional client-supplied ISO timestamp from filename inference at capture time. */
  clientRecordedAt?: string | null
  /** Original filename — used by the server filename regex. */
  filename: string
  /** R2 key of the source object — used to Range-fetch the first 2 MB for mvhd. */
  r2Key: string
  /** Workers env carrying R2 binding + presigning secrets. */
  env: R2Env
}

export interface DeriveResult {
  recorded_at: string | null
  recorded_at_source: RecordedAtSource | null
}

export async function deriveRecordedAt(input: DeriveInput): Promise<DeriveResult> {
  // Tier 1 — client pre-extracted
  if (input.clientRecordedAt) {
    const d = new Date(input.clientRecordedAt)
    if (!Number.isNaN(d.getTime())) {
      return { recorded_at: d.toISOString(), recorded_at_source: 'pre_extracted' }
    }
  }

  // Tier 2 — mvhd via HTTP Range
  try {
    const signed = await presignGetUrl(input.env, input.r2Key, 600)
    const mvhd = await readMp4CreationTime(signed)
    if (mvhd) return { recorded_at: mvhd, recorded_at_source: 'mvhd' }
  } catch {
    // presigning may fail when keys are missing; fall through to filename
  }

  // Tier 3 — filename regex
  const fromName = matchFilenameDate(input.filename)
  if (fromName) return { recorded_at: fromName, recorded_at_source: 'filename' }

  // Tier 4 — caller falls back to upload_time_default
  return { recorded_at: null, recorded_at_source: null }
}

// ─── mvhd extraction ────────────────────────────────────────────────────────

/**
 * Read the MP4 mvhd creation time. Tries first 2MB (fast-start layout, where
 * moov is at the top) AND last 2MB (non-fast-start, common on iPhone exports
 * where moov is appended after mdat). Two Range requests, total ≤4MB.
 */
async function readMp4CreationTime(signedUrl: string): Promise<string | null> {
  // Tier 1: fast-start layout — moov near the beginning.
  try {
    const head = await fetch(signedUrl, { headers: { Range: 'bytes=0-2097151' } })
    if (head.ok || head.status === 206) {
      const buf = new Uint8Array(await head.arrayBuffer())
      const r = walkAtoms(buf, 'moov', moov => walkAtoms(moov, 'mvhd', readMvhdDate))
      if (r) return r
    }
  } catch { /* fall through to tail probe */ }

  // Tier 2: non-fast-start layout — moov at the end of the file. The
  // "bytes=-N" syntax asks for the last N bytes. Apple's tooling defaults
  // to this layout, which is why iPhone .mp4 / .mov exports usually need it.
  try {
    const tail = await fetch(signedUrl, { headers: { Range: 'bytes=-2097151' } })
    if (tail.ok || tail.status === 206) {
      const buf = new Uint8Array(await tail.arrayBuffer())
      return walkAtoms(buf, 'moov', moov => walkAtoms(moov, 'mvhd', readMvhdDate))
    }
  } catch { /* fall through */ }
  return null
}

function walkAtoms(
  buf: Uint8Array,
  target: string,
  onMatch: (inner: Uint8Array) => string | null,
): string | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let pos = 0
  while (pos + 8 <= buf.length) {
    let size = view.getUint32(pos)
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7])
    let headerSize = 8
    if (size === 1 && pos + 16 <= buf.length) {
      size = view.getUint32(pos + 8) * 0x100000000 + view.getUint32(pos + 12)
      headerSize = 16
    }
    if (size < headerSize) break
    if (type === target && pos + size <= buf.length) {
      const r = onMatch(buf.subarray(pos + headerSize, pos + size))
      if (r) return r
    }
    pos += size
  }
  return null
}

function readMvhdDate(buf: Uint8Array): string | null {
  if (buf.length < 16) return null
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const version = buf[0]
  let creationTimeSec: number
  if (version === 0) {
    creationTimeSec = view.getUint32(4)
  } else {
    creationTimeSec = view.getUint32(4) * 0x100000000 + view.getUint32(8)
  }
  if (creationTimeSec <= 0) return null
  const date = new Date((creationTimeSec - MP4_EPOCH_OFFSET_SEC) * 1000)
  const yr = date.getUTCFullYear()
  if (yr < 1990 || yr > new Date().getUTCFullYear() + 1) return null
  return date.toISOString()
}

// ─── filename regex (server-side, broader than client) ─────────────────────

// Each entry: [pattern, formatter producing an ISO 8601 string].
// The 14-consecutive-digit pattern is critical for DJI Mimo
// (`DJI_20260401110554_0055_D.MP4`) which was missing client-side. The ISO
// compact (`20260401T110554`) covers cameras that emit BasicISO.
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  // YYYY-MM-DD[T_ ]HH[-:]MM[-:]SS
  [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
  // YYYYMMDD_HHMMSS
  [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
  // YYYYMMDDTHHMMSS (ISO compact)
  [/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
  // 14 consecutive digits — YYYYMMDDHHMMSS (DJI Mimo)
  [/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
  // YYYY-MM-DD (date only)
  [/(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
  // YYYYMMDD (date only)
  [/(\d{4})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
]

export function matchFilenameDate(filename: string): string | null {
  for (const [regex, fmt] of PATTERNS) {
    const m = filename.match(regex)
    if (!m) continue
    const dStr = fmt(m)
    const d = new Date(dStr)
    const yr = d.getUTCFullYear()
    if (!Number.isNaN(d.getTime()) && yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) {
      return d.toISOString()
    }
  }
  return null
}
