import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { presignDownloadUrl } from '@/lib/storage/r2'

export const runtime = 'edge'

const MP4_EPOCH_OFFSET_SEC = 2082844800

function walkAtoms(buf: Uint8Array, target: string, onMatch: (inner: Uint8Array) => string | null): string | null {
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
      const result = onMatch(buf.subarray(pos + headerSize, pos + size))
      if (result) return result
    }
    pos += size
  }
  return null
}

function readMvhdDate(buf: Uint8Array): string | null {
  if (buf.length < 12) return null
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const version = buf[0]
  const creationTimeSec = version === 0
    ? view.getUint32(4)
    : view.getUint32(4) * 0x100000000 + view.getUint32(8)
  if (creationTimeSec <= 0) return null
  const date = new Date((creationTimeSec - MP4_EPOCH_OFFSET_SEC) * 1000)
  const yr = date.getUTCFullYear()
  if (yr < 1990 || yr > new Date().getUTCFullYear() + 1) return null
  return date.toISOString()
}

async function tryRange(url: string, range: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { headers: { Range: range } })
    if (!res.ok && res.status !== 206) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch { return null }
}

async function readMp4Date(signedUrl: string): Promise<string | null> {
  // Try head first (streaming-optimized MP4), then tail (DJI/camera raw output).
  const head = await tryRange(signedUrl, 'bytes=0-2097151')
  if (head) {
    const d = walkAtoms(head, 'moov', b => walkAtoms(b, 'mvhd', readMvhdDate))
    if (d) return d
  }
  const tail = await tryRange(signedUrl, 'bytes=-4194304')
  if (tail) {
    return walkAtoms(tail, 'moov', b => walkAtoms(b, 'mvhd', readMvhdDate))
  }
  return null
}

const DATE_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
  [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
  [/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
  [/(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
  [/(\d{4})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
]

function inferDateFromFilename(fileName: string): string | null {
  for (const [regex, fmt] of DATE_PATTERNS) {
    const m = fileName.match(regex)
    if (m) {
      const dStr = fmt(m)
      const date = new Date(dStr)
      const yr = date.getUTCFullYear()
      if (!isNaN(date.getTime()) && yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) return date.toISOString()
    }
  }
  return null
}

/**
 * POST /api/system/run-date-backfill
 * Directly processes uploads with null recorded_at without going through Inngest.
 * Tries: MP4 mvhd (head + tail for DJI files) → filename → created_at fallback.
 */
export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Admin unavailable' }, { status: 500 })

    const { data: uploads, error } = await admin
      .from('video_uploads')
      .select('id, file_name, storage_path, mime_type, meta, created_at')
      .eq('user_id', user.id)
      .is('recorded_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!uploads || uploads.length === 0) return NextResponse.json({ updated: 0, skipped: 0 })

    let updated = 0
    let skipped = 0
    const results: Array<{ id: string; source: string; date: string }> = []

    for (const upload of uploads) {
      let recordedAt: string | null = null
      let source = ''

      // 1. MP4 mvhd — checks both head (streaming) and tail (DJI/camera output)
      const isMedia = (upload.mime_type || '').startsWith('video/') || (upload.mime_type || '').startsWith('audio/')
      if (isMedia && upload.storage_path) {
        try {
          const url = await presignDownloadUrl(upload.storage_path, 300)
          recordedAt = await readMp4Date(url)
          if (recordedAt) source = 'mp4-mvhd'
        } catch { /* fall through */ }
      }

      // 2. Filename inference
      if (!recordedAt) {
        recordedAt = inferDateFromFilename(upload.file_name || '')
        if (recordedAt) source = 'filename'
      }

      // 3. created_at fallback — better than showing "Today" indefinitely
      if (!recordedAt && upload.created_at) {
        recordedAt = upload.created_at
        source = 'created_at'
      }

      if (recordedAt) {
        await admin.from('video_uploads').update({
          recorded_at: recordedAt,
          meta: { ...(upload.meta || {}), recorded_at_source: source, backfilled: true },
        }).eq('id', upload.id)
        updated++
        results.push({ id: upload.id, source, date: recordedAt })
      } else {
        skipped++
      }
    }

    return NextResponse.json({ updated, skipped, total: uploads.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
