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
import { runExtraction, type ExtractionMode } from '../../../src/lib/extract-unified'
import { runWhisper } from '../../../src/lib/whisper'
import { ulid } from '../../../src/lib/ulid'
import { putObject } from '../../../src/lib/r2'

interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  AI: Ai
  FFMPEG: Fetcher
  // Service binding to neolog-pipeline (DO worker). Workflow uses this to
  // emit per-step events that the live UI's WebSocket sees in real time.
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  ANTHROPIC_API_KEY: string
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  // Heartbeat shared secret + public pipeline URL — handed to the FFmpeg
  // container so it can post its own progress events directly. Container
  // can't use service bindings; it makes outbound HTTPS.
  HEARTBEAT_TOKEN?: string
  PIPELINE_URL?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  // Direct Workers AI REST API token — used as the last-resort path in
  // runWhisper when the env.AI binding's JSON encoding fails the model's
  // schema. Same value as the wrangler/Cloudflare API token; we can reuse
  // the deploy token here because it has Workers AI scope.
  CF_AI_TOKEN?: string
  CLOUDFLARE_API_TOKEN?: string
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
    // Re-extract dispatch (from /api/v2/vlogs/[id]/process) explicitly sets
    // `passes`. Fresh uploads from /api/v2/vlogs POST do not. When this is a
    // re-extract, skip the setup steps (transcode / thumbnail / recorded_at)
    // entirely — they're only useful for first-time processing. The LLM
    // passes read transcript_text, not the video file.
    const isReExtract = event.payload.passes != null && event.payload.passes.length > 0

    // ── Step 1: load context ─────────────────────────────────────────────────
    const vlog = await step.do('fetch-context', async () => {
      const row = await this.env.DB.prepare(
        `SELECT id, operator_id, r2_key, original_filename, mime_type, recorded_at,
                transcoded_r2_key, thumbnail_url, thumbnail_r2_key, transcript_text, pipeline_status,
                audio_chunks_json
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
        thumbnail_r2_key: string | null
        transcript_text: string | null
        pipeline_status: string
        audio_chunks_json: string | null
      }>()
      if (!row) throw new Error(`Vlog not found: ${vlog_id}`)
      return row
    })

    const reportStatus = async (status: string) => {
      await this.env.DB.prepare(
        `UPDATE vlogs SET pipeline_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(status, vlog_id).run()
    }

    // Per-step outcomes. Written to vlogs.extraction_outcomes JSON at the end
    // so the operator can see exactly what worked/failed without scrolling
    // Cloudflare dashboards. Rebuilt from scratch on workflow resume — that's
    // fine because each step.do replays from its durable checkpoint.
    const outcomes: Record<string, { ok: boolean; ms?: number; error?: string; [k: string]: unknown }> = {}
    const recordOutcome = async (name: string, payload: typeof outcomes[string]) => {
      outcomes[name] = payload
      try {
        await this.env.DB.prepare(
          `UPDATE vlogs SET extraction_outcomes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(JSON.stringify(outcomes), vlog_id).run()
      } catch {
        // best-effort; the in-memory copy is the source of truth for THIS run
      }
    }
    // softStep wraps step.do so that when retries exhaust, the failure is
    // recorded in `outcomes` but does NOT abort the workflow. Each feature
    // stands on its own — a flaky transcode can no longer take thumbnail,
    // recorded_at, transcribe, or extraction passes down with it.
    //
    // ALSO writes to the new `pipeline_events` table on every transition.
    // pipeline_events stores the FULL untruncated error text (vs the 500-char
    // preview in extraction_outcomes) and is what the /system page +
    // /timeline/[id] event log read from. The old JSON column stays
    // populated as a compatibility shim until all readers migrate.
    const WORKER_VERSION = 'rebuild-2026-05-18'

    /**
     * Emit one pipeline event. Prefers the PIPELINE service binding
     * (DO inserts to D1 AND fans out to WebSocket clients), falls back
     * to direct D1 insert if the binding isn't wired up.
     */
    const insertPipelineEvent = async (
      name: string,
      status: 'started' | 'ok' | 'failed' | 'skipped',
      durationMs: number,
      errorFullText: string | null,
      subStep: string | null = null,
      detail: Record<string, unknown> = {},
    ) => {
      // Preferred: through the pipeline DO so live UI sees it.
      if (this.env.PIPELINE && this.env.HEARTBEAT_TOKEN) {
        try {
          const res = await this.env.PIPELINE.fetch(`https://internal/event/${vlog_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Heartbeat-Token': this.env.HEARTBEAT_TOKEN,
            },
            body: JSON.stringify({
              operator_id,
              step: name,
              sub_step: subStep,
              status,
              detail_json: JSON.stringify({ ...detail, state: status }),
              duration_ms: durationMs,
              error_full_text: errorFullText,
              ts: Date.now(),
            }),
          })
          if (res.ok) return
        } catch {
          // fall through to direct D1 insert
        }
      }
      // Fallback: direct insert. Live UI's 5-second poll picks it up.
      try {
        await this.env.DB.prepare(
          `INSERT INTO pipeline_events
             (id, vlog_id, operator_id, step, sub_step, status, runtime, worker_version,
              started_at, completed_at, duration_ms, detail_json, error_full_text, ts)
           VALUES (?, ?, ?, ?, ?, ?, 'workflow', ?,
                   datetime('now', ?), CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), vlog_id, operator_id, name, subStep, status, WORKER_VERSION,
          `-${Math.round(durationMs / 1000)} seconds`, durationMs,
          JSON.stringify({ ...detail, state: status }),
          errorFullText, Date.now(),
        ).run()
      } catch {
        // pipeline_events table might not exist yet on the very first cold
        // start after deploy. Migration runner creates it but only when a
        // Pages route is hit first. We swallow here so the workflow doesn't
        // blow up on the bootstrap edge.
      }
    }

    const softStep = async <T>(
      name: string,
      opts: any,
      fn: () => Promise<T>,
    ): Promise<T | null> => {
      const t0 = Date.now()
      const startedAt = new Date().toISOString()
      await recordOutcome(name, { ok: false, status: 'running', started_at: startedAt, ms: 0 } as any)
      await insertPipelineEvent(name, 'started', 0, null)
      try {
        const result = opts
          ? await (step as any).do(name, opts, fn)
          : await (step as any).do(name, fn)
        const ms = Date.now() - t0
        await recordOutcome(name, { ok: true, status: 'done', started_at: startedAt, ms } as any)
        await insertPipelineEvent(name, 'ok', ms, null)
        return result as T
      } catch (e: any) {
        const fullMsg = e?.stack || `${e?.name || 'Error'}: ${e?.message || String(e)}`
        const preview = String(e?.message ?? e).slice(0, 500)
        console.warn(`[softStep:${name}] failed: ${preview}`)
        const ms = Date.now() - t0
        await recordOutcome(name, { ok: false, status: 'failed', started_at: startedAt, ms, error: preview } as any)
        await insertPipelineEvent(name, 'failed', ms, fullMsg)
        return null
      }
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
              const thumbKey = `${operator_id}/thumbs/${vlog_id}.jpg`
              await this.env.VIDEOS.put(thumbKey, jpegBytes, {
                httpMetadata: { contentType: 'image/jpeg' },
              })
              // Sticky: only write if no R2 thumbnail key yet AND no legacy
              // data-URI thumbnail. Prevents zombies from clobbering.
              await this.env.DB.prepare(
                `UPDATE vlogs SET thumbnail_r2_key = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND thumbnail_r2_key IS NULL AND thumbnail_url IS NULL`,
              ).bind(thumbKey, vlog_id).run()
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

    // ── Step 2: extract thumbnail FAST PATH ─────────────────────────────────
    // Was previously gated behind a slow transcode (the original "LOCKED HEVC
    // transcode-then-thumb" rule, which existed because the old /extract-thumb
    // returned 0 frames on DJI Mimo HEVC verticals due to rotation metadata).
    // That rule is now obsolete: /extract-thumb has -noautorotate, and the
    // new /extract-thumb-mini-transcode fallback handles the rare files where
    // direct extract still misses. Thumbnail now lands in 2-5 seconds for
    // fresh uploads instead of waiting on a 5-10min transcode.
    //
    // Cascade:
    //   tier 1 — /extract-thumb on original (direct, -noautorotate)
    //   tier 2 — /extract-thumb-mini-transcode on original (2-sec mini transcode)
    //   tier 3 — (later) /extract-thumb on transcoded output, after the slow
    //            transcode step completes. Only triggered if 1+2 both failed.
    if (!vlog.thumbnail_url && !vlog.thumbnail_r2_key && !isReExtract && (isVideo || vlog.mime_type === 'video/mp4')) {
      await softStep(
        'extract-thumbnail',
        { retries: { limit: 1, delay: '10 seconds' }, timeout: '90 seconds' },
        async () => {
          const inputUrl = await presignR2Get(this.env, vlog.r2_key, 3600)
          let bytes: Uint8Array | null = null
          let method: 'direct' | 'mini_transcode' = 'direct'
          // Tier 1 — direct
          try {
            const r = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-thumb', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input_url: inputUrl, t: 1.0 }),
            })
            if (r.ok) {
              const buf = new Uint8Array(await r.arrayBuffer())
              if (buf.byteLength >= 1024) bytes = buf
            }
          } catch { /* try mini-transcode */ }
          // Tier 2 — mini-transcode (2-sec H.264 reencode, then grab one frame)
          if (!bytes) {
            try {
              const r = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-thumb-mini-transcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input_url: inputUrl, t: 1.0 }),
              })
              if (r.ok) {
                const buf = new Uint8Array(await r.arrayBuffer())
                if (buf.byteLength >= 1024) { bytes = buf; method = 'mini_transcode' }
              }
            } catch { /* fall through; tier 3 may catch in a later step */ }
          }
          if (!bytes) {
            throw new Error('both direct and mini-transcode tiers produced no usable JPEG')
          }
          const thumbKey = `${operator_id}/thumbs/${vlog_id}.jpg`
          await this.env.VIDEOS.put(thumbKey, bytes, {
            httpMetadata: { contentType: 'image/jpeg' },
          })
          await this.env.DB.prepare(
            `UPDATE vlogs SET thumbnail_r2_key = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND thumbnail_r2_key IS NULL AND thumbnail_url IS NULL`,
          ).bind(thumbKey, vlog_id).run()
          return { method, bytes: bytes.byteLength }
        },
      )
    }

    // ── Step 3: transcode to H.264 (for browser playback) ───────────────────
    // No longer blocks the thumbnail. The transcoded MP4 is used by the
    // detail page's <video> tag so non-Safari browsers can play HEVC sources.
    // If this step fails, the operator can still re-trigger transcode via
    // the vlog detail page; the existing thumbnail + transcript remain
    // intact.
    let transcodedKey = vlog.transcoded_r2_key
    if (isVideo && !transcodedKey && !isReExtract) {
      await step.do('mark-transcoding', async () => reportStatus('transcoding'))

      transcodedKey = await softStep(
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

    // ── Step 3b: thumbnail tier 3 — try once more from transcoded output ────
    // Only runs if the fast thumbnail extract (step 2) failed AND transcode
    // succeeded. Rare path — covers files where rotation metadata is so
    // mangled that even mini-transcode produces a black frame.
    const thumbOutcome = (outcomes as any)['extract-thumbnail']
    const thumbFailed = thumbOutcome && thumbOutcome.ok === false && thumbOutcome.status === 'failed'
    if (thumbFailed && transcodedKey && !vlog.thumbnail_r2_key && !vlog.thumbnail_url) {
      await softStep(
        'extract-thumbnail-from-transcoded',
        { retries: { limit: 1 }, timeout: '60 seconds' },
        async () => {
          const inputUrl = await presignR2Get(this.env, transcodedKey!, 3600)
          const r = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-thumb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input_url: inputUrl, t: 1.0 }),
          })
          if (!r.ok) throw new Error(`tier-3 thumb HTTP ${r.status}`)
          const buf = new Uint8Array(await r.arrayBuffer())
          if (buf.byteLength < 1024) throw new Error(`tier-3 jpeg suspiciously small: ${buf.byteLength}B`)
          const thumbKey = `${operator_id}/thumbs/${vlog_id}.jpg`
          await this.env.VIDEOS.put(thumbKey, buf, { httpMetadata: { contentType: 'image/jpeg' } })
          await this.env.DB.prepare(
            `UPDATE vlogs SET thumbnail_r2_key = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND thumbnail_r2_key IS NULL AND thumbnail_url IS NULL`,
          ).bind(thumbKey, vlog_id).run()
          return { method: 'transcoded_fallback', bytes: buf.byteLength }
        },
      )
    }

    // For extract_thumb_only HEVC path, stop here — we wanted ONLY a thumbnail.
    if (event.payload.extract_thumb_only) {
      await step.do('mark-archived-after-thumb-extract', async () => reportStatus('archived'))
      return { vlog_id, status: 'thumbnail_complete' }
    }

    // ── Step 4: extract recorded_at (LOCKED three-tier fallback) ────────────
    // The API route also runs this synchronously at INSERT time via the shared
    // src/lib/recorded-at.ts module. This step stays as a safety net for
    // archived imports / cases where the API tiers all missed.
    if (!vlog.recorded_at && isVideo && !isReExtract) {
      await softStep('extract-recorded-at', null, async () => {
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
        return { tier: source, value: recorded }
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

      await softStep(
        'transcribe',
        { retries: { limit: 2, delay: '30 seconds' }, timeout: '15 minutes' },
        async () => {
          // Preferred path: browser-extracted audio chunks already in R2.
          // Each chunk is 16 kHz mono WAV at most 5 min long — Whisper
          // accepts these directly, well under its 25 MB request limit.
          // We transcribe each chunk in sequence, offset word timestamps
          // by chunk.start_sec, and stitch.
          //
          // Legacy ffmpeg path was retired with the Cloudflare Container
          // Worker (couldn't reliably instantiate). If audio_chunks_json
          // is empty, we record a clear failure outcome and the operator
          // re-extracts in-browser from /uploads.
          let chunks: Array<{ r2_key: string; start_sec: number; end_sec: number; bytes: number }> = []
          try {
            chunks = vlog.audio_chunks_json ? JSON.parse(vlog.audio_chunks_json) : []
          } catch {
            chunks = []
          }
          if (!Array.isArray(chunks) || chunks.length === 0) {
            // Audio-only file fallback: if the source is already audio (mp3,
            // wav, m4a) we can pass the raw R2 bytes straight to Whisper.
            if (!isVideo) {
              const r2Obj = await this.env.VIDEOS.get(vlog.r2_key)
              if (!r2Obj) throw new Error(`R2 object missing: ${vlog.r2_key}`)
              const audioBytes = new Uint8Array(await r2Obj.arrayBuffer())
              const result: any = await runWhisper(this.env, audioBytes)
              const transcript = result.text ?? result.transcription ?? ''
              await this.env.DB.prepare(
                `UPDATE vlogs SET transcript_text = ?, transcript_provider = 'workers_ai_whisper',
                                  transcript_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`,
              ).bind(transcript, vlog_id).run()
              return
            }

            // Video fallback: use the FFmpeg container to extract MP3 audio,
            // pass it to Whisper. The container posts -progress pipe:1
            // heartbeats to the pipeline DO so the operator sees ffmpeg
            // making progress in real time instead of a static "running"
            // spinner for several minutes.
            //
            // Emit these events under step='audio_extract' so the new
            // /timeline/[id] UI's "Audio extract" card sees them instead
            // of all of them folding into "Transcribe". Browser
            // chunked-audio path skips this entire block (audio_chunks_json
            // is non-empty); when that path runs, the DO's own audio_extract
            // step emits a skipped event with the same step name.
            await insertPipelineEvent('audio_extract', 'started', 0, null, 'invoke_ffmpeg', { state: 'starting' })
            const sourceKey = transcodedKey || vlog.r2_key
            const inputUrl = await presignR2Get(this.env, sourceKey, 3600)
            const ctl = new AbortController()
            const timer = setTimeout(() => ctl.abort(), 10 * 60 * 1000) // 10 min hard cap
            let audioResp: Response
            try {
              audioResp = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  input_url: inputUrl,
                  // Container POSTs progress here every ~1s — public URL of
                  // the pipeline worker, authed via HEARTBEAT_TOKEN. If unset
                  // (legacy deploy) the container falls back to a no-op.
                  heartbeat_url: this.env.PIPELINE_URL,
                  heartbeat_token: this.env.HEARTBEAT_TOKEN,
                  vlog_id,
                  operator_id,
                }),
                signal: ctl.signal,
              } as RequestInit)
            } catch (err: any) {
              clearTimeout(timer)
              throw new Error(`ffmpeg /extract-audio fetch failed: ${err?.message || err}`)
            }
            clearTimeout(timer)
            if (!audioResp.ok) {
              const errBody = (await audioResp.text()).slice(0, 500)
              throw new Error(`ffmpeg /extract-audio ${audioResp.status}: ${errBody}`)
            }
            const audioBytes = new Uint8Array(await audioResp.arrayBuffer())
            await insertPipelineEvent('audio_extract', 'ok', 0, null, 'invoke_ffmpeg', {
              state: 'ok', bytes: audioBytes.byteLength,
            })
            await insertPipelineEvent('transcribe', 'started', 0, null, 'whisper_call', {
              state: 'starting', bytes: audioBytes.byteLength,
            })
            const result: any = await runWhisper(this.env, audioBytes)
            const transcript = result.text ?? result.transcription ?? ''
            await this.env.DB.prepare(
              `UPDATE vlogs SET transcript_text = ?, transcript_provider = 'workers_ai_whisper',
                                transcript_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            ).bind(transcript, vlog_id).run()
            // Write word-level timestamps if Whisper returned them
            const words: any[] = Array.isArray(result.words) ? result.words : []
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
              const CHUNK = 100
              for (let i = 0; i < stmts.length; i += CHUNK) {
                await this.env.DB.batch(stmts.slice(i, i + CHUNK))
              }
            }
            return
          }

          // Browser already chunked the audio at upload time. Emit a
          // skipped audio_extract event so the UI shows "Skipped: audio
          // already on R2" on the Audio extract card instead of IDLE.
          await insertPipelineEvent('audio_extract', 'skipped', 0, null, 'skip_if_exists', {
            reason: 'artifact_exists', chunks: chunks.length,
          })
          const allWords: Array<{ word: string; start: number; end: number }> = []
          let stitched = ''
          for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci]
            const obj = await this.env.VIDEOS.get(chunk.r2_key)
            if (!obj) {
              throw new Error(`audio chunk missing from R2: ${chunk.r2_key}`)
            }
            const audioBytes = new Uint8Array(await obj.arrayBuffer())
            // Workers AI Whisper accepts audio as either an array of bytes OR
            // a raw Uint8Array buffer. Array.from() balloons a 4 MB WAV into
            // a 12 MB JSON-serialized array which trips the per-request size
            // limit. The Uint8Array form is binary-streamed by the AI binding
            // — much more compact. Same trick the docs use for vision models.
            //
            // We also drop the `task: 'transcribe'` param: it's the default and
            // some newer Whisper model schemas have rejected it as unknown.
            let result: any
            try {
              result = await runWhisper(this.env, audioBytes)
            } catch (err: any) {
              // Surface the real error verbatim so extraction_outcomes shows
              // exactly what Workers AI rejected, instead of a 40-char preview.
              const detail = err?.message || err?.stack || String(err)
              throw new Error(
                `Whisper failed on chunk ${ci + 1}/${chunks.length} ` +
                `(${chunk.bytes} bytes, ${chunk.end_sec - chunk.start_sec}s): ${detail}`,
              )
            }
            const text = result?.text ?? result?.transcription ?? ''
            if (text) stitched = stitched ? `${stitched} ${text}` : text
            const words: any[] = Array.isArray(result?.words) ? result.words : []
            for (const w of words) {
              if (!w.word || typeof w.start !== 'number' || typeof w.end !== 'number') continue
              allWords.push({
                word: String(w.word).trim(),
                start: w.start + chunk.start_sec,
                end: w.end + chunk.start_sec,
              })
            }
          }

          await this.env.DB.prepare(
            `UPDATE vlogs SET transcript_text = ?, transcript_provider = 'workers_ai_whisper',
                              transcript_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
          ).bind(stitched, vlog_id).run()

          if (allWords.length > 0) {
            const stmts = allWords.map((w, idx) =>
              this.env.DB.prepare(
                `INSERT INTO transcript_words (vlog_id, operator_id, word, start_time, end_time, word_index)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(vlog_id, word_index) DO NOTHING`,
              ).bind(vlog_id, operator_id, w.word, w.start, w.end, idx),
            )
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
      // ── Unified extraction ────────────────────────────────────────────────
      // Single LLM call returns threads + clips + creative_elements + entities
      // as one JSON response. Validator runs against transcript with 4-gram
      // grounding; if cheap-tier fails >15% of items, auto-escalates to
      // Sonnet 4.6. Provenance recorded in extraction_runs.is_active=1 row.
      //
      // Note: legacy extract* functions stay in src/lib/extract.ts as a
      // fallback path until this proves out. Toggle by setting
      // `passes=[...]` to a non-empty subset to run the legacy 4-pass code.
      const legacyPath = (passesToRun.size > 0 && passesToRun.size < 4)
      const extractCtx = {
        vlog_id,
        operator_id,
        transcript_text: transcriptRow.transcript_text,
        tier,
      }
      if (legacyPath) {
        if (passesToRun.has('threads')) {
          await softStep('extract-threads', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
            return await extractThreads(this.env, extractCtx)
          })
        }
        if (passesToRun.has('clip_candidates')) {
          await softStep('extract-clip-candidates', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
            return await extractClipCandidates(this.env, extractCtx)
          })
        }
        if (passesToRun.has('creative_elements')) {
          await softStep('extract-creative-elements', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
            return await extractCreativeElements(this.env, extractCtx)
          })
        }
        if (passesToRun.has('entities')) {
          await softStep('extract-entities', { retries: { limit: 2, delay: '30 seconds' }, timeout: '5 minutes' }, async () => {
            return await extractEntities(this.env, extractCtx)
          })
        }
      } else {
        const mode: ExtractionMode = tier === 'max' || tier === 'premium' ? 'premium' : 'auto'
        await softStep('extract', { retries: { limit: 1, delay: '30 seconds' }, timeout: '8 minutes' }, async () => {
          const progress = async (sub: string, payload: Record<string, unknown>) => {
            const state = (payload.state as string | undefined) === 'ok' ? 'ok'
              : (payload.state as string | undefined) === 'error' ? 'failed'
              : 'started'
            await insertPipelineEvent('extract', state, 0, null, sub, payload)
          }
          const run = await runExtraction(this.env, transcriptRow.transcript_text!, mode, progress)
          const run_id = ulid()
          const r2_key = `${operator_id}/extractions/${vlog_id}/${run_id}.json`
          // Best-effort: write the full payload to R2 as cold storage
          try {
            await putObject(this.env, r2_key, JSON.stringify(run.payload), {
              httpMetadata: { contentType: 'application/json' },
            })
          } catch (err: any) {
            console.warn(`[extract] R2 write failed: ${err?.message || err}`)
          }
          // Mark older active runs inactive
          await this.env.DB.prepare(
            `UPDATE extraction_runs SET is_active = 0 WHERE vlog_id = ? AND is_active = 1`,
          ).bind(vlog_id).run()
          // Insert the new run row
          await this.env.DB.prepare(
            `INSERT INTO extraction_runs
               (id, vlog_id, operator_id, model, escalated_from, mode, r2_key,
                total_items, invalid_items, fail_rate, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          ).bind(
            run_id, vlog_id, operator_id, run.model, run.escalated_from ?? null, mode, r2_key,
            run.total_items, run.invalid_items, run.fail_rate, Date.now(),
          ).run()

          // Save the 60-120 word summary to vlogs.summary so it renders at
          // the top of the detail page without needing a separate fetch.
          if (run.payload.summary && run.payload.summary.length > 10) {
            try {
              await this.env.DB.prepare(
                `UPDATE vlogs SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              ).bind(run.payload.summary, vlog_id).run()
            } catch (err: any) {
              console.warn('[extract] vlogs.summary write failed:', err?.message || err)
            }
          }

          // Flatten payload into existing tables. Old rows for this vlog
          // remain (with run_id NULL or pointing to an older run); the UI
          // reads run_id = active run to filter. Cheaper than re-deleting.
          const stmts: any[] = []
          for (const t of run.payload.threads) {
            stmts.push(this.env.DB.prepare(
              `INSERT INTO threads
                 (id, operator_id, vlog_id, run_id, topic, take, key_quotes, register, validated, extracted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            ).bind(
              ulid(), operator_id, vlog_id, run_id,
              String(t.topic || '').slice(0, 200),
              String(t.take || ''),
              JSON.stringify(t.key_quotes ?? []),
              String(t.register || 'observation'),
              t.validated ?? 1,
            ))
          }
          for (const c of run.payload.clips) {
            stmts.push(this.env.DB.prepare(
              `INSERT INTO clip_candidates
                 (id, operator_id, vlog_id, run_id, start_time, end_time, headline, quote, why_clippable, validated, status, extracted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
            ).bind(
              ulid(), operator_id, vlog_id, run_id,
              c.start_time_ms != null ? c.start_time_ms / 1000 : 0,
              c.end_time_ms != null ? c.end_time_ms / 1000 : 0,
              String(c.headline || '').slice(0, 200),
              String(c.quote || ''),
              JSON.stringify({ reason: c.why_clippable ?? '' }),
              c.validated ?? 1,
            ))
          }
          for (const e of run.payload.creative_elements) {
            stmts.push(this.env.DB.prepare(
              `INSERT INTO creative_elements
                 (id, operator_id, vlog_id, run_id, element_type, content, validated, extracted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            ).bind(
              ulid(), operator_id, vlog_id, run_id,
              String(e.element_type || 'theme'),
              String(e.content || ''),
              e.validated ?? 1,
            ))
          }
          for (const ent of run.payload.entities) {
            stmts.push(this.env.DB.prepare(
              `INSERT INTO entities
                 (id, operator_id, vlog_id, run_id, name, entity_type, mention_count, first_mentioned_at, last_mentioned_at)
               VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            ).bind(
              ulid(), operator_id, vlog_id, run_id,
              String(ent.name || '').slice(0, 200),
              String(ent.entity_type || 'concept'),
            ))
          }
          const CHUNK = 50
          for (let i = 0; i < stmts.length; i += CHUNK) {
            try {
              await this.env.DB.batch(stmts.slice(i, i + CHUNK))
            } catch (err: any) {
              console.warn(`[extract] batch insert failed (i=${i}): ${err?.message || err}`)
            }
          }

          await progress('llm_persist', {
            state: 'ok', run_id,
            threads: run.payload.threads.length,
            clips: run.payload.clips.length,
            creative_elements: run.payload.creative_elements.length,
            entities: run.payload.entities.length,
            model: run.model,
            escalated_from: run.escalated_from ?? null,
            fail_rate: run.fail_rate,
          })
          return { run_id, ...run }
        })
      }
    } else {
      console.log(`[process-upload] no transcript text for vlog ${vlog_id} — skipping extraction`)
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
