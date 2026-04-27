import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { presignDownloadUrl } from '@/lib/storage/r2'

export const runtime = 'edge'

const MP4_EPOCH_OFFSET_SEC = 2082844800

async function readMp4CreationTime(signedUrl: string): Promise<string | null> {
  const res = await fetch(signedUrl, { headers: { Range: 'bytes=0-2097151' } })
  if (!res.ok && res.status !== 206) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  return walkAtoms(buf, 'moov', (moovBuf) => walkAtoms(moovBuf, 'mvhd', readMvhdDate))
}

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
      if (!isNaN(date.getTime()) && yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) {
        return date.toISOString()
      }
    }
  }
  return null
}

export const backfillRecordedAt = inngest.createFunction(
  { id: 'backfill-recorded-at' },
  { event: 'system/backfill-recorded-at' },
  async ({ event, step }) => {
    const { user_id } = event.data
    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client unavailable')

    // Fetch all uploads for this user with null recorded_at
    const uploads = await step.run('fetch-null-date-uploads', async () => {
      const { data, error } = await admin
        .from('video_uploads')
        .select('id, file_name, storage_path, mime_type, meta, created_at')
        .eq('user_id', user_id)
        .is('recorded_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      return data ?? []
    })

    if (uploads.length === 0) return { updated: 0, skipped: 0 }

    let updated = 0
    let skipped = 0

    // Process in batches of 10 to avoid timeout
    const BATCH = 10
    for (let i = 0; i < uploads.length; i += BATCH) {
      const batch = uploads.slice(i, i + BATCH)

      await step.run(`process-batch-${i}`, async () => {
        for (const upload of batch) {
          let recordedAt: string | null = null
          let source = ''

          // 1. Try MP4 mvhd atom (best accuracy — actual recording timestamp)
          const isMediaFile = upload.mime_type?.startsWith('video/') || upload.mime_type?.startsWith('audio/')
          if (isMediaFile && upload.storage_path) {
            try {
              const signedUrl = await presignDownloadUrl(upload.storage_path, 300)
              recordedAt = await readMp4CreationTime(signedUrl)
              if (recordedAt) source = 'mp4-mvhd'
            } catch {
              // silent — fall through to filename
            }
          }

          // 2. Filename inference
          if (!recordedAt) {
            recordedAt = inferDateFromFilename(upload.file_name)
            if (recordedAt) source = 'filename-inference'
          }

          // Last resort: use upload created_at so the video appears in the
          // timeline at roughly the right time rather than being undated.
          if (!recordedAt && (upload as any).created_at) {
            recordedAt = (upload as any).created_at
            source = 'created_at-fallback'
          }

          if (recordedAt) {
            await admin.from('video_uploads').update({
              recorded_at: recordedAt,
              meta: { ...(upload.meta || {}), recorded_at_source: source, backfilled: true },
              updated_at: new Date().toISOString(),
            }).eq('id', upload.id)
            updated++
          } else {
            skipped++
          }
        }
      })
    }

    return { updated, skipped, total: uploads.length }
  }
)
