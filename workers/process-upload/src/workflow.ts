/**
 * Neolog process-upload Cloudflare Workflow.
 *
 * Orchestrates the locked post-upload pipeline. Each step is durably
 * checkpointed by Cloudflare Workflows — if the Worker dies mid-step, the
 * Workflow resumes from the last completed step on retry.
 *
 * Steps (in order; ordering is LOCKED — see CLAUDE.md):
 *
 *   1. fetch-context        — load the vlog row from D1
 *   2. transcode-h264       — call the FFmpeg Container Worker to produce an
 *                              MP4 with rotation metadata stripped, so frame
 *                              extraction works on DJI Mimo HEVC verticals.
 *                              Output stored at {operator_id}/transcoded/{id}.mp4
 *   3. extract-thumbnail    — call the Container Worker to grab a frame at
 *                              t=1.0s, store as data: URI in vlogs.thumbnail_url
 *                              (LOCKED — bypasses signed URL expiry)
 *   4. extract-recorded-at  — mvhd / filename / created_at fallback if not
 *                              already set by the client-side path
 *   5. extract-audio        — pull mp3 out of the source (or skip if already a
 *                              pure audio mime)
 *   6. transcribe           — Workers AI Whisper-large-v3-turbo, writes plain
 *                              text to vlogs.transcript_text and per-word rows
 *                              to transcript_words
 *   7. fan-out extraction   — analytical / creative_mode / clip_candidate
 *                              passes via Claude. Implemented in a separate
 *                              workflow that this one dispatches at the end.
 *                              (Placeholder for now.)
 *
 * Three-tier recorded_at fallback (LOCKED): pre-extracted (client filename
 * inference) → mvhd atom → filename pattern → created_at. mvhd extraction
 * uses MP4 epoch offset 2082844800 with v0/v1 branch handling.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import type { D1Database, R2Bucket, Ai, Fetcher } from '@cloudflare/workers-types'
import {
  extractThreads,
  extractClipCandidates,
  extractCreativeElements,
  extractEntities,
} from '../../../src/lib/extract'

interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  AI: Ai
  FFMPEG: Fetcher
  ANTHROPIC_API_KEY: string
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
}

interface Params {
  vlog_id: string
  operator_id: string
  tier?: 'free' | 'premium' | 'max'  // extraction provider tier — defaults to 'free' (Workers AI Llama)
  passes?: ('threads' | 'clip_candidates' | 'creative_elements' | 'entities')[]  // when set, re-run only these passes
  thumbnail_only?: boolean  // when true, runs transcode+thumbnail only, skips transcribe + all extractions
  extract_thumb_only?: boolean  // when true, JUST extracts a thumbnail. Skips transcode for H.264 sources (1-2 sec). Falls through to locked transcode-then-thumb for HEVC. No transcribe, no extractions.
}

const MP4_EPOCH_OFFSET_SEC = 2082844800 // seconds between 1904-01-01 and 1970-01-01

export class ProcessUploadWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { vlog_id, operator_id } = event.payload
    const tier: 'free' | 'premium' | 'max' = event.payload.tier ?? 'free'
    const thumbnailOnly = event.payload.thumbnail_only === true
    const passesToRun = new Set(event.payload.passes ?? ['threads', 'clip_candidates', 'creative_elements', 'entities'])

    // ── Step 1: load context ─────────────────────────────────────────────────
    const vlog = await step.do('fetch-context', async () => {
      const row = await this.env.DB.prepare(
        `SELECT id, operator_id, r2_key, original_filename, mime_type, recorded_at,
                transcoded_r2_key, thumbnail_url, transcript_text, pipeline_status
           FROM vlogs WHERE id = ? AND operator_id = ?`,
      ).bind(vlog_id, operator_id).first<{
        id: string
        operator_id: string
        r2_key: string
        original_filename: string
        mime_type: string
        recorded_at: string | null
        transcoded_r2_key: string | null
        thumbnail_url: string | null
        transcript_text: string | null
        pipeline_status: string
      }>()
      if (!row) throw new Error(`Vlog not found: ${vlog_id}`)
      return row
    })

    const reportStatus = async (status: string) => {
      await this.env.DB.prepare(
        `UPDATE vlogs SET pipeline_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(status, vlog_id).run()
    }

    const isVideo = vlog.mime_type.startsWith('video/')
    const mimeLower = (vlog.mime_type || '').toLowerCase()
    const filenameLower = (vlog.original_filename || '').toLowerCase()
    const looksHevc =
      /hevc|hev1|hvc1|x265/.test(mimeLower) ||
      mimeLower === 'video/quicktime' ||
      filenameLower.endsWith('.mov')

    // ── extract_thumb_only fast path ────────────────────────────────────────
    // Generate just a thumbnail. For H.264 sources, skip transcode entirely
    // (FFmpeg /extract-thumb works directly on H.264 in ~1-2 sec). For HEVC,
    // fall through to the locked transcode-then-thumb chain — but DO NOT run
    // transcribe or extractions after.
    if (event.payload.extract_thumb_only && isVideo) {
      if (!vlog.thumbnail_url) {
        if (!looksHevc) {
          // Fast path: direct extract-thumb against the original
          await step.do(
            'extract-thumb-fast',
            { retries: { limit: 2, delay: '10 seconds' }, timeout: '2 minutes' },
            async () => {
              const inputUrl = await presignR2Get(this.env, vlog.r2_key, 600)
              const ffResp = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-thumb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input_url: inputUrl, t: 1.0 }),
              })
              if (!ffResp.ok) {
                throw new Error(`ffmpeg thumbnail failed (${ffResp.status}): ${(await ffResp.text()).slice(0, 300)}`)
              }
              const jpegBytes = new Uint8Array(await ffResp.arrayBuffer())
              const dataUri = `data:image/jpeg;base64,${bufferToBase64(jpegBytes)}`
              // Sticky: only write if no thumbnail exists. Prevents zombie
              // batch workflows from later overwriting an operator-generated thumb.
              await this.env.DB.prepare(
                `UPDATE vlogs SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND thumbnail_url IS NULL`,
              ).bind(dataUri, vlog_id).run()
            },
          )
          await step.do('mark-archived-after-fast-thumb', async () => reportStatus('archived'))
          return { vlog_id, status: 'thumbnail_fast_complete' }
        }
        // looksHevc: fall through to the regular transcode-then-thumb path
        // below. We still skip transcribe + extractions via the same
        // thumbnail_only short-circuit later.
      } else {
        // Already has a thumbnail; nothing to do.
        return { vlog_id, status: 'thumbnail_already_present' }
      }
    }

    // ── Step 2: transcode to H.264 (LOCKED — must precede thumbnail) ────────
    let transcodedKey = vlog.transcoded_r2_key
    if (isVideo && !transcodedKey) {
      await step.do('mark-transcoding', async () => reportStatus('transcoding'))

      transcodedKey = await step.do(
        'transcode-h264',
        { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
        async () => {
          const inputUrl = await presignR2Get(this.env, vlog.r2_key, 3600)
          const ffmpegResp = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/transcode-h264', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input_url: inputUrl }),
          })
          if (!ffmpegResp.ok) {
            const err = await ffmpegResp.text()
            throw new Error(`ffmpeg transcode failed (${ffmpegResp.status}): ${err.slice(0, 500)}`)
          }
          const key = `${operator_id}/transcoded/${vlog_id}.mp4`
          await this.env.VIDEOS.put(key, ffmpegResp.body!, {
            httpMetadata: { contentType: 'video/mp4' },
          })
          await this.env.DB.prepare(
            `UPDATE vlogs SET transcoded_r2_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).bind(key, vlog_id).run()
          return key
        },
      )
    }

    // ── Step 3: extract thumbnail (LOCKED format: data: URI in DB) ──────────
    if (!vlog.thumbnail_url && (isVideo || vlog.mime_type === 'video/mp4')) {
      await step.do(
        'extract-thumbnail',
        { retries: { limit: 2, delay: '15 seconds' }, timeout: '5 minutes' },
        async () => {
          // Extract from the transcoded file when available (rotation metadata stripped)
          const sourceKey = transcodedKey || vlog.r2_key
          const inputUrl = await presignR2Get(this.env, sourceKey, 3600)
          const ffmpegResp = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-thumb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input_url: inputUrl, t: 1.0 }),
          })
          if (!ffmpegResp.ok) {
            const err = await ffmpegResp.text()
            throw new Error(`ffmpeg thumbnail failed (${ffmpegResp.status}): ${err.slice(0, 500)}`)
          }
          const jpegBytes = new Uint8Array(await ffmpegResp.arrayBuffer())
          const b64 = bufferToBase64(jpegBytes)
          const dataUri = `data:image/jpeg;base64,${b64}`
          // Sticky write — only set if thumbnail_url is still null. Protects
          // operator-generated fast-path thumbnails from being overwritten by
          // a zombie workflow that finishes later with a transcoded-source frame.
          await this.env.DB.prepare(
            `UPDATE vlogs SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND thumbnail_url IS NULL`,
          ).bind(dataUri, vlog_id).run()
        },
      )
    }

    // For extract_thumb_only HEVC path, stop here — we wanted ONLY a thumbnail.
    if (event.payload.extract_thumb_only) {
      await step.do('mark-archived-after-thumb-extract', async () => reportStatus('archived'))
      return { vlog_id, status: 'thumbnail_complete' }
    }

    // ── Step 4: extract recorded_at (LOCKED three-tier fallback) ────────────
    if (!vlog.recorded_at && isVideo) {
      await step.do('extract-recorded-at', async () => {
        // Tier 1: already set (pre-extracted from client) → handled by the `if` above
        // Tier 2: mvhd atom
        let recorded: string | null = null
        let source: string = 'upload_time_default'
        try {
          const signedUrl = await presignR2Get(this.env, vlog.r2_key, 600)
          recorded = await readMp4CreationTime(signedUrl)
          if (recorded) source = 'mvhd'
        } catch (err: any) {
          console.warn(`[extract-recorded-at] mvhd parse failed: ${err.message}`)
        }
        // Tier 3: filename
        if (!recorded) {
          const m = matchFilenameDate(vlog.original_filename)
          if (m) {
            recorded = m
            source = 'filename'
          }
        }
        if (recorded) {
          await this.env.DB.prepare(
            `UPDATE vlogs SET recorded_at = ?, recorded_at_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).bind(recorded, source, vlog_id).run()
        }
      })
    }

    // Short-circuit for thumbnail-only batch (used by the /uploads bulk
    // thumbnail regeneration). Transcode + thumbnail + recorded_at already ran;
    // we skip transcribe + extraction and mark the row archived again.
    if (thumbnailOnly) {
      await step.do('mark-thumbnail-only-complete', async () => {
        await this.env.DB.prepare(
          `UPDATE vlogs SET pipeline_status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(vlog_id).run()
      })
      return { vlog_id, status: 'thumbnail_only_complete' }
    }

    // ── Step 5 & 6: transcribe ──────────────────────────────────────────────
    if (!vlog.transcript_text) {
      await step.do('mark-transcribing', async () => reportStatus('transcribing'))

      await step.do(
        'transcribe',
        { retries: { limit: 2, delay: '30 seconds' }, timeout: '15 minutes' },
        async () => {
          // For video sources, extract audio first via ffmpeg
          let audioBytes: Uint8Array
          if (isVideo) {
            const sourceKey = transcodedKey || vlog.r2_key
            const inputUrl = await presignR2Get(this.env, sourceKey, 3600)
            const audioResp = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input_url: inputUrl }),
            })
            if (!audioResp.ok) {
              const err = await audioResp.text()
              throw new Error(`ffmpeg audio extract failed (${audioResp.status}): ${err.slice(0, 500)}`)
            }
            audioBytes = new Uint8Array(await audioResp.arrayBuffer())
          } else {
            const r2Obj = await this.env.VIDEOS.get(vlog.r2_key)
            if (!r2Obj) throw new Error(`R2 object missing: ${vlog.r2_key}`)
            audioBytes = new Uint8Array(await r2Obj.arrayBuffer())
          }

          // Workers AI Whisper
          const result: any = await this.env.AI.run(
            '@cf/openai/whisper-large-v3-turbo' as any,
            { audio: Array.from(audioBytes), task: 'transcribe' } as any,
          )

          const transcript = result.text ?? result.transcription ?? ''
          await this.env.DB.prepare(
            `UPDATE vlogs SET transcript_text = ?, transcript_provider = 'workers_ai_whisper',
                              transcript_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
          ).bind(transcript, vlog_id).run()

          // Write word-level timestamps if Whisper returned them
          const words: any[] = result.words || []
          if (words.length > 0) {
            const stmts = words
              .filter(w => w.word && typeof w.start === 'number' && typeof w.end === 'number')
              .map((w, idx) =>
                this.env.DB.prepare(
                  `INSERT INTO transcript_words (vlog_id, operator_id, word, start_time, end_time, word_index)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(vlog_id, word_index) DO NOTHING`,
                ).bind(vlog_id, operator_id, String(w.word).trim(), w.start, w.end, idx),
              )
            // D1 batch supports many statements at once
            const CHUNK = 100
            for (let i = 0; i < stmts.length; i += CHUNK) {
              await this.env.DB.batch(stmts.slice(i, i + CHUNK))
            }
          }
        },
      )
    }

    // ── Step 7: mark extracting ──────────────────────────────────────────────
    await step.do('mark-extracting', async () => reportStatus('extracting'))

    // Reload the transcript text — it was written in the transcribe step but
    // we need a fresh read since the Workflow may resume here from a retry.
    const transcriptRow = await step.do('reload-transcript', async () => {
      const row = await this.env.DB.prepare(
        'SELECT transcript_text FROM vlogs WHERE id = ?',
      ).bind(vlog_id).first<{ transcript_text: string | null }>()
      return row
    })

    if (transcriptRow?.transcript_text && transcriptRow.transcript_text.length > 20) {
      const extractCtx = {
        vlog_id,
        operator_id,
        transcript_text: transcriptRow.transcript_text,
        tier,
      }

      // Each pass runs only if it's in the passes set. This lets the operator
      // re-run a single pass (e.g. just threads after iterating the prompt)
      // without paying for the others.

      if (passesToRun.has('threads')) {
        await step.do('extract-threads', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
          const result = await extractThreads(this.env, extractCtx)
          console.log(`[extract-threads] tier=${tier} inserted=${result.inserted} rejected_voice=${result.rejected}`)
          return result
        })
      }

      if (passesToRun.has('clip_candidates')) {
        await step.do('extract-clip-candidates', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
          const result = await extractClipCandidates(this.env, extractCtx)
          console.log(`[extract-clip-candidates] tier=${tier} inserted=${result.inserted}`)
          return result
        })
      }

      if (passesToRun.has('creative_elements')) {
        await step.do('extract-creative-elements', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
          const result = await extractCreativeElements(this.env, extractCtx)
          console.log(`[extract-creative-elements] tier=${tier} inserted=${result.inserted}`)
          return result
        })
      }

      if (passesToRun.has('entities')) {
        await step.do('extract-entities', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
          const result = await extractEntities(this.env, extractCtx)
          console.log(`[extract-entities] tier=${tier} entities=${result.entitiesUpserted} mentions=${result.mentionsInserted}`)
          return result
        })
      }
    } else {
      console.log(`[process-upload] no transcript text for vlog ${vlog_id} — skipping extraction passes`)
    }

    // ── Final: mark complete ─────────────────────────────────────────────────
    await step.do('mark-complete', async () => reportStatus('complete'))

    return { vlog_id, status: 'complete' }
  }
}

// Default fetch handler — exposes a /dispatch endpoint that creates a new
// workflow instance. The main Pages app calls this via a Service binding
// (Pages projects don't yet support [[workflows]] in wrangler.toml, so we
// fan in through fetch instead). Anything else returns 404.
//
// Service binding caller pattern:
//   await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
//     method: 'POST',
//     body: JSON.stringify({ vlog_id, operator_id }),
//   })
interface DispatchEnv extends Env {
  PROCESS_UPLOAD_WORKFLOW: any
}

export default {
  async fetch(req: Request, env: DispatchEnv): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/dispatch') {
      const body = await req.json().catch(() => null) as {
        vlog_id?: string; operator_id?: string;
        tier?: 'free' | 'premium' | 'max';
        passes?: ('threads' | 'clip_candidates' | 'creative_elements' | 'entities')[];
        thumbnail_only?: boolean;
        extract_thumb_only?: boolean;
      } | null
      if (!body?.vlog_id || !body?.operator_id) {
        return new Response(JSON.stringify({ error: 'vlog_id and operator_id required' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        })
      }
      try {
        const instance = await env.PROCESS_UPLOAD_WORKFLOW.create({
          id: `process-upload-${body.vlog_id}-${Date.now()}`,
          params: {
            vlog_id: body.vlog_id,
            operator_id: body.operator_id,
            tier: body.tier ?? 'free',
            passes: body.passes,
            thumbnail_only: body.thumbnail_only === true,
            extract_thumb_only: body.extract_thumb_only === true,
          },
        })
        return new Response(JSON.stringify({ ok: true, instance_id: instance.id }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    return new Response('Not found', { status: 404 })
  },
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function bufferToBase64(bytes: Uint8Array): string {
  // Manual base64 encoder so we don't depend on Node's Buffer in Workers
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b1 = bytes[i++]
    const b2 = i < bytes.length ? bytes[i++] : -1
    const b3 = i < bytes.length ? bytes[i++] : -1
    out += chars[(b1 >> 2) & 0x3f]
    out += chars[((b1 << 4) | ((b2 >= 0 ? b2 : 0) >> 4)) & 0x3f]
    out += b2 < 0 ? '=' : chars[((b2 << 2) | ((b3 >= 0 ? b3 : 0) >> 6)) & 0x3f]
    out += b3 < 0 ? '=' : chars[b3 & 0x3f]
  }
  return out
}

// Walk MP4 atoms for the `mvhd` creation time. Mirrors the locked
// implementation in the previous Inngest function (process-upload.ts:161-208).
async function readMp4CreationTime(signedUrl: string): Promise<string | null> {
  const res = await fetch(signedUrl, { headers: { Range: 'bytes=0-2097151' } })
  if (!res.ok && res.status !== 206) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  return walkAtoms(buf, 'moov', moovBuf => walkAtoms(moovBuf, 'mvhd', readMvhdDate))
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
      const result = onMatch(buf.subarray(pos + headerSize, pos + size))
      if (result) return result
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

function matchFilenameDate(filename: string): string | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
    [/(\d{4})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
  ]
  for (const [regex, fmt] of patterns) {
    const m = filename.match(regex)
    if (m) {
      const dStr = fmt(m)
      const d = new Date(dStr)
      const yr = d.getUTCFullYear()
      if (!isNaN(d.getTime()) && yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) {
        return d.toISOString()
      }
    }
  }
  return null
}

// SigV4 presigner for R2 GET (mirrors src/lib/r2.ts; inlined so this Workflow
// is independent of the Next.js app).
async function presignR2Get(env: Env, key: string, ttlSeconds: number): Promise<string> {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 presigning needs R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY Worker secrets')
  }
  const host = `${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const now = new Date()
  const amzDate = formatAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const credential = `${env.R2_ACCESS_KEY_ID}/${credentialScope}`
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(ttlSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ].sort(([a], [b]) => a.localeCompare(b))
  const canonicalQuery = query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const canonicalRequest = [
    'GET',
    `/${env.R2_BUCKET_NAME}/${encodedKey}`,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')
  const signingKey = await deriveSigningKey(env.R2_SECRET_ACCESS_KEY, dateStamp)
  const signature = await hmacHex(signingKey, stringToSign)
  return `https://${host}/${env.R2_BUCKET_NAME}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

function formatAmzDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  return bufToHex(await crypto.subtle.digest('SHA-256', buf))
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  return bufToHex(await hmac(key, data))
}

async function deriveSigningKey(secret: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode('AWS4' + secret), dateStamp)
  const kRegion = await hmac(kDate, 'auto')
  const kService = await hmac(kRegion, 's3')
  return hmac(kService, 'aws4_request')
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}
