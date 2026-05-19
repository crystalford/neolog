/**
 * Neolog pipeline — VlogPipelineDO + host worker.
 *
 * THE orchestrator for every vlog's post-upload work. Replaces the previous
 * 13-step Workflow worker (neolog-process-upload) with a 3-step DO-driven
 * pipeline:
 *
 *   audio_extract  →  transcribe  →  extract
 *
 * One DO instance per vlog (id derived from vlog_id). DO storage holds the
 * pointer + per-step attempts + force flags. Alarm-driven execution: each
 * alarm tick runs the current step and either advances the pointer or
 * schedules a retry with exponential backoff. DO hibernates between events,
 * billing only during active JS.
 *
 * Skip-if-exists guards run before each step. Re-running a step costs
 * nothing if its artifact already exists — operator can iterate on
 * extraction prompts 50× without re-running ffmpeg or Whisper once.
 *
 * Pipeline events flow into D1 (pipeline_events table) AND fan out to any
 * browser WebSocket subscribed at /ws/:vlog_id so the operator sees real-time
 * byte/chunk/token-level progress on /timeline/[id].
 *
 * Entry points (host worker /fetch handler routes by path prefix):
 *   POST /start/:vlog_id         Kick a new pipeline. Body: { operator_id, mode? }
 *   POST /reextract/:vlog_id     Skip to extract step (override the prior run).
 *                                Body: { operator_id, mode? }
 *   POST /heal/:vlog_id          Healer cron re-kicks a stuck pipeline.
 *   POST /event/:vlog_id         Heartbeat ingest (container, internal use).
 *                                Authed via X-Heartbeat-Token.
 *   GET  /ws/:vlog_id            Browser WebSocket for live progress.
 *   GET  /events/:vlog_id        Read recent events (D1 fallback).
 */

import type {
  D1Database,
  DurableObjectNamespace,
  DurableObjectState,
  Fetcher,
  R2Bucket,
  Ai,
} from '@cloudflare/workers-types'

import { runExtraction, type ExtractionMode } from '../../../src/lib/extract-unified'
import { runWhisper } from '../../../src/lib/whisper'
import { ulid } from '../../../src/lib/ulid'
import { surfaceFromRun } from '../../../src/lib/surface'

export interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  AI: Ai
  FFMPEG: Fetcher
  PIPELINE_DO: DurableObjectNamespace
  HEARTBEAT_TOKEN: string
  ANTHROPIC_API_KEY: string
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  PIPELINE_URL: string
  // REST fallback for Whisper — see src/lib/whisper.ts
  CF_AI_TOKEN?: string
  CLOUDFLARE_API_TOKEN?: string
}

const WORKER_VERSION = 'pipeline-do-2026-05-18'
const MAX_SNAPSHOT_EVENTS = 200

type StepKey = 'audio_extract' | 'transcribe' | 'extract'
const STEPS: StepKey[] = ['audio_extract', 'transcribe', 'extract']

const MAX_ATTEMPTS: Record<StepKey, number> = {
  audio_extract: 3,
  transcribe: 3,
  // Extract retries are higher because the failure modes are mostly
  // transient: Workers AI rate-limit windows, Anthropic overload, the
  // "silent empty extraction" guard catching a degraded LLM response.
  // Backoff caps at 60s, so 5 retries = up to ~2 min of patience per
  // vlog before marking failed_terminal. With concurrency 1-2 in bulk,
  // that's enough to ride out most quota recovery windows.
  extract: 5,
}

function backoffMs(attempt: number): number {
  // Exponential with a 60s ceiling and ±15% jitter so simultaneous
  // failures (a whole bulk run hitting the same rate limit) don't
  // re-fire in lock-step.
  const base = Math.min(60_000, 1_000 * Math.pow(2, attempt))
  const jitter = base * (0.85 + Math.random() * 0.30)
  return Math.floor(jitter)
}

// ─── Host worker ────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const segs = url.pathname.split('/').filter(Boolean)
    const route = segs[0]
    const vlog_id = segs[1]

    if (!route || !vlog_id) return new Response('not found', { status: 404 })

    // Browser WebSocket — proxy directly to the DO.
    if (route === 'ws') {
      const id = env.PIPELINE_DO.idFromName(vlog_id)
      const stub = env.PIPELINE_DO.get(id)
      return stub.fetch(req)
    }

    // Read-only events query (D1 fallback for clients that can't open WS).
    if (route === 'events' && req.method === 'GET') {
      const rows = await readRecentEvents(env.DB, vlog_id, MAX_SNAPSHOT_EVENTS)
      return new Response(JSON.stringify({ events: rows }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Authenticated POST endpoints below: token gate.
    if (req.method !== 'POST') return new Response('POST only', { status: 405 })
    if (req.headers.get('x-heartbeat-token') !== env.HEARTBEAT_TOKEN) {
      // /start, /reextract, /heal are typically dispatched from other Workers
      // via service binding — service-binding calls inherit auth from the
      // calling worker, but we still gate on the shared secret for any
      // public Pages → DO bridge as defense-in-depth. The Pages /api/v2/
      // routes set this header before forwarding.
      return new Response('forbidden — missing or invalid heartbeat token', { status: 403 })
    }

    // /event/:vlog_id — heartbeat from container, workflow shim, or extractor.
    if (route === 'event') {
      const body = await req.json().catch(() => null) as any
      if (!body || !body.step || !body.status || !body.operator_id) {
        return new Response('step, status, operator_id required', { status: 400 })
      }
      const event = {
        vlog_id,
        operator_id: body.operator_id,
        step: body.step,
        sub_step: body.sub_step ?? null,
        status: body.status,
        detail_json: typeof body.detail_json === 'string'
          ? body.detail_json
          : JSON.stringify(body.detail_json ?? {}),
        duration_ms: body.duration_ms ?? null,
        error_full_text: body.error_full_text ?? null,
        attempt: body.attempt ?? 1,
        ts: body.ts ?? Date.now(),
      }
      const id = await insertEvent(env.DB, event)
      // Fan out to WS clients via the DO
      const stub = env.PIPELINE_DO.get(env.PIPELINE_DO.idFromName(vlog_id))
      await stub.fetch('https://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...event, id }),
      })
      return new Response(JSON.stringify({ ok: true, id }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // /start/:vlog_id — register endpoint kicks a fresh pipeline.
    // /reextract/:vlog_id — re-extract endpoint: skip to extract step.
    // /heal/:vlog_id — healer cron re-kicks (alarm wakes; DO resumes).
    if (route === 'start' || route === 'reextract' || route === 'heal') {
      const body = await req.json().catch(() => ({})) as any
      const stub = env.PIPELINE_DO.get(env.PIPELINE_DO.idFromName(vlog_id))
      const resp = await stub.fetch(`https://do/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_id, ...body }),
      })
      return resp
    }

    return new Response('not found', { status: 404 })
  },

  async scheduled() {
    // Cron triggers go to the healer worker, not here.
  },
}

// ─── Pipeline events: D1 persistence ─────────────────────────────────────────

interface PipelineEventInsert {
  vlog_id: string
  operator_id: string
  step: string
  sub_step: string | null
  status: string
  detail_json: string
  duration_ms: number | null
  error_full_text: string | null
  attempt: number
  ts: number
}

function mapStatusForColumn(s: string): string {
  switch (s) {
    case 'ok': return 'ok'
    case 'skipped': return 'skipped'
    case 'error':
    case 'failed_terminal':
    case 'failed': return 'failed'
    case 'starting':
    case 'running':
    case 'retrying':
    case 'started':
    default: return 'started'
  }
}

async function insertEvent(db: D1Database, e: PipelineEventInsert): Promise<string> {
  let detail: Record<string, unknown> = {}
  try { detail = JSON.parse(e.detail_json) as Record<string, unknown> } catch {}
  detail.state = e.status
  const detailStr = JSON.stringify(detail)
  const id = crypto.randomUUID()
  await db.prepare(
    `INSERT INTO pipeline_events
       (id, vlog_id, operator_id, step, sub_step, status, runtime, worker_version,
        started_at, completed_at, duration_ms, detail_json, error_full_text, attempt, ts)
     VALUES (?, ?, ?, ?, ?, ?, 'pipeline', ?,
             datetime('now', ?), CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
  ).bind(
    id, e.vlog_id, e.operator_id, e.step, e.sub_step,
    mapStatusForColumn(e.status), WORKER_VERSION,
    `-${Math.round((e.duration_ms ?? 0) / 1000)} seconds`,
    e.duration_ms, detailStr, e.error_full_text,
    e.attempt, e.ts,
  ).run()
  return id
}

async function readRecentEvents(db: D1Database, vlog_id: string, limit: number) {
  // Filter to events from the NEW DO orchestrator (runtime='pipeline'). The
  // legacy workflow worker (runtime='workflow') wrote events with the same
  // step name 'transcribe' which would otherwise leak into the new 3-card
  // UI and make a finished vlog look like it's mid-processing.
  // ts may be NULL on rows written before that column existed; fall back
  // to started_at (ISO string) → epoch ms.
  const res = await db.prepare(
    `SELECT id, vlog_id, operator_id, step, sub_step, status, runtime,
            COALESCE(ts, CAST(strftime('%s', started_at) AS INTEGER) * 1000) AS ts,
            duration_ms, detail_json, error_full_text,
            COALESCE(attempt, 1) AS attempt
       FROM pipeline_events
      WHERE vlog_id = ?
        AND step IN ('audio_extract', 'transcribe', 'extract')
        AND (runtime = 'pipeline' OR runtime IS NULL)
      ORDER BY ts ASC
      LIMIT ?`,
  ).bind(vlog_id, limit).all()
  return res.results ?? []
}

// ─── R2 SigV4 presigner (inlined; mirrors src/lib/r2.ts) ─────────────────────

async function presignR2Get(env: Env, key: string, ttlSeconds: number): Promise<string> {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 presigning needs R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY')
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
async function hmacHex(key: ArrayBuffer | Uint8Array, msg: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key as any, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg))
  return bufToHex(sig)
}
async function deriveSigningKey(secret: string, dateStamp: string): Promise<ArrayBuffer> {
  const kSecret = new TextEncoder().encode('AWS4' + secret)
  const kDate = await hmacRaw(kSecret, dateStamp)
  const kRegion = await hmacRaw(kDate, 'auto')
  const kService = await hmacRaw(kRegion, 's3')
  return hmacRaw(kService, 'aws4_request')
}
async function hmacRaw(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key as any, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg))
}
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── VlogPipelineDO: orchestrator + WebSocket fan-out ────────────────────────

interface VlogRow {
  id: string
  operator_id: string
  r2_key: string
  mime_type: string
  transcript_text: string | null
  audio_chunks_json: string | null
  thumbnail_r2_key: string | null
  transcoded_r2_key: string | null
}

interface StartParams {
  operator_id?: string
  mode?: ExtractionMode
}

interface ReextractParams extends StartParams {
  pointer?: StepKey  // start from this step (default 'extract')
  force?: boolean
}

export class VlogPipelineDO {
  private state: DurableObjectState
  private env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  // ── DO HTTP entry ──
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const segs = url.pathname.split('/').filter(Boolean)
    const route = segs[0]

    // WebSocket connect — browser subscribes for live progress.
    if (route === 'ws') {
      if (req.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 })
      }
      const vlog_id = segs[1]
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
      this.state.acceptWebSocket(server)
      const snapshot = await readRecentEvents(this.env.DB, vlog_id, MAX_SNAPSHOT_EVENTS)
      try { server.send(JSON.stringify({ type: 'snapshot', vlog_id, events: snapshot })) } catch {}
      return new Response(null, { status: 101, webSocket: client })
    }

    if (route === 'broadcast' && req.method === 'POST') {
      const event = await req.json()
      const sockets = this.state.getWebSockets()
      const payload = JSON.stringify({ type: 'event', event })
      for (const ws of sockets) {
        try { ws.send(payload) } catch {}
      }
      return new Response('ok')
    }

    if (route === 'start') {
      const body = await req.json() as { vlog_id: string } & StartParams
      await this.state.storage.put('vlog_id', body.vlog_id)
      await this.state.storage.put('operator_id', body.operator_id ?? null)
      if (body.mode) await this.state.storage.put('mode', body.mode)
      await this.state.storage.put('pointer', STEPS[0])
      await this.state.storage.put('force_audio_extract', false)
      await this.state.storage.put('force_transcribe', false)
      await this.state.storage.put('force_extract', false)
      await this.clearAttempts()
      await this.state.storage.setAlarm(Date.now() + 100)
      return new Response('started')
    }

    if (route === 'reextract') {
      const body = await req.json() as { vlog_id: string } & ReextractParams
      await this.state.storage.put('vlog_id', body.vlog_id)
      await this.state.storage.put('operator_id', body.operator_id ?? null)
      if (body.mode) await this.state.storage.put('mode', body.mode)
      const from = (body.pointer && STEPS.includes(body.pointer)) ? body.pointer : 'extract'
      await this.state.storage.put('pointer', from)
      if (body.force) await this.state.storage.put(`force_${from}`, true)
      await this.clearAttempts()
      await this.state.storage.setAlarm(Date.now() + 100)
      return new Response('scheduled')
    }

    if (route === 'heal') {
      const body = await req.json().catch(() => ({})) as { vlog_id?: string }
      if (body.vlog_id && !(await this.state.storage.get('vlog_id'))) {
        await this.state.storage.put('vlog_id', body.vlog_id)
      }
      await this.state.storage.setAlarm(Date.now() + 100)
      return new Response('kicked')
    }

    return new Response('not found', { status: 404 })
  }

  // ── Alarm: run the current step ──
  async alarm(): Promise<void> {
    const vlog_id = await this.state.storage.get<string>('vlog_id')
    if (!vlog_id) return
    const pointer = await this.state.storage.get<StepKey>('pointer')
    if (!pointer || pointer === undefined) {
      // Already done
      await this.setVlogState(vlog_id, 'ready', null)
      return
    }

    const vlog = await this.loadVlog(vlog_id)
    if (!vlog) {
      await this.recordEvent(vlog_id, '_internal_', 'failed_terminal', 'load_vlog',
        { reason: 'vlog row not found' }, 'vlog row missing')
      return
    }

    const operator_id = vlog.operator_id
    const attempt = ((await this.state.storage.get<number>(`attempts:${pointer}`)) ?? 0) + 1
    const force = (await this.state.storage.get<boolean>(`force_${pointer}`)) === true
    const mode = (await this.state.storage.get<ExtractionMode>('mode')) ?? 'auto'

    try {
      // Skip-if-exists
      if (!force && await this.artifactExists(vlog, pointer)) {
        await this.recordEvent(vlog_id, pointer, 'skipped', 'skip_if_exists',
          { reason: 'artifact_exists' })
        await this.advance(pointer)
        await this.state.storage.setAlarm(Date.now() + 50)
        return
      }

      await this.recordEvent(vlog_id, pointer, 'starting', null, { attempt })
      await this.setVlogState(vlog_id, stateForStep(pointer), null)

      const t0 = Date.now()
      switch (pointer) {
        case 'audio_extract': await this.stepAudioExtract(vlog); break
        case 'transcribe': await this.stepTranscribe(vlog); break
        case 'extract': await this.stepExtract(vlog, mode); break
      }
      const ms = Date.now() - t0
      await this.recordEvent(vlog_id, pointer, 'ok', null, { duration_ms: ms })
      await this.state.storage.delete(`attempts:${pointer}`)
      await this.state.storage.delete(`force_${pointer}`)
      await this.advance(pointer)
      await this.state.storage.setAlarm(Date.now() + 50)
    } catch (e: any) {
      const fullErr = `${e?.message ?? e}\n${e?.stack ?? ''}`
      const max = MAX_ATTEMPTS[pointer]
      if (attempt < max) {
        await this.state.storage.put(`attempts:${pointer}`, attempt)
        const wait = backoffMs(attempt)
        await this.recordEvent(vlog_id, pointer, 'retrying', null,
          { attempt, next_in_ms: wait }, fullErr)
        await this.state.storage.setAlarm(Date.now() + wait)
      } else {
        await this.recordEvent(vlog_id, pointer, 'failed_terminal', null,
          { attempts: attempt }, fullErr)
        await this.setVlogState(vlog_id, 'failed', fullErr.slice(0, 4000))
      }
    }
  }

  // ── Steps ──

  /**
   * audio_extract: produce audio for transcription.
   *
   * Skip if: transcript already exists (we wouldn't transcribe anyway),
   *          OR audio_chunks_json on vlog row is non-empty (browser
   *          already chunked at upload time),
   *          OR a full MP3 already exists in R2 at the canonical key.
   *
   * Else: call FFmpeg /extract-audio with heartbeat URL so the operator
   *       sees per-second ffmpeg progress on /timeline/[id]. Write the
   *       resulting MP3 to R2 at {operator}/audio/{vlog_id}/mp3.full.
   */
  private async stepAudioExtract(vlog: VlogRow): Promise<void> {
    if (!vlog.mime_type.startsWith('video/')) {
      // Audio-only source — nothing to extract; transcribe step reads R2 directly.
      await this.recordEvent(vlog.id, 'audio_extract', 'skipped', 'audio_source',
        { reason: 'source is audio/*' })
      return
    }
    const sourceKey = vlog.transcoded_r2_key || vlog.r2_key
    const inputUrl = await presignR2Get(this.env, sourceKey, 3600)

    await this.recordEvent(vlog.id, 'audio_extract', 'running', 'invoke_ffmpeg',
      { source_key: sourceKey })

    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 10 * 60 * 1000) // 10 min cap
    let resp: Response
    try {
      resp = await this.env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_url: inputUrl,
          heartbeat_url: this.env.PIPELINE_URL,
          heartbeat_token: this.env.HEARTBEAT_TOKEN,
          vlog_id: vlog.id,
          operator_id: vlog.operator_id,
        }),
        signal: ctl.signal,
      } as RequestInit)
    } catch (err: any) {
      clearTimeout(timer)
      throw new Error(`ffmpeg /extract-audio fetch failed: ${err?.message || err}`)
    }
    clearTimeout(timer)
    if (!resp.ok) {
      const errBody = (await resp.text()).slice(0, 500)
      throw new Error(`ffmpeg /extract-audio ${resp.status}: ${errBody}`)
    }

    const audioBytes = new Uint8Array(await resp.arrayBuffer())
    const r2Key = `${vlog.operator_id}/audio/${vlog.id}/mp3.full`
    await this.env.VIDEOS.put(r2Key, audioBytes, {
      httpMetadata: { contentType: 'audio/mpeg' },
    })
    await this.recordEvent(vlog.id, 'audio_extract', 'running', 'upload_r2',
      { r2_key: r2Key, bytes: audioBytes.byteLength })
  }

  /**
   * transcribe: turn audio into transcript_text + transcript_words rows.
   *
   * Skip if: transcript_text already set on the row.
   *
   * Source priority:
   *   1. audio_chunks_json (browser-extracted WAV chunks; transcribe in order)
   *   2. {operator}/audio/{vlog_id}/mp3.full (single MP3 from audio_extract step)
   *   3. original r2_key (audio-only source files)
   */
  private async stepTranscribe(vlog: VlogRow): Promise<void> {
    let chunks: Array<{ r2_key: string; start_sec: number; end_sec: number; bytes: number }> = []
    try { chunks = vlog.audio_chunks_json ? JSON.parse(vlog.audio_chunks_json) : [] } catch {}

    const allWords: Array<{ word: string; start: number; end: number }> = []
    let stitched = ''

    if (Array.isArray(chunks) && chunks.length > 0) {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]
        await this.recordEvent(vlog.id, 'transcribe', 'running', `chunk_${i}`,
          { chunk: i, of: chunks.length, attempt: 1 })
        const obj = await this.env.VIDEOS.get(c.r2_key)
        if (!obj) throw new Error(`audio chunk missing from R2: ${c.r2_key}`)
        const bytes = new Uint8Array(await obj.arrayBuffer())
        const result = await this.whisperWithRetry(bytes, i, chunks.length)
        const text = result?.text ?? result?.transcription ?? ''
        if (text) stitched = stitched ? `${stitched} ${text}` : text
        await this.recordEvent(vlog.id, 'transcribe', 'ok', `chunk_${i}`,
          { chunk: i, of: chunks.length, chars_out: text.length })
        const wordList: any[] = Array.isArray(result?.words) ? result.words : []
        for (const w of wordList) {
          if (!w.word || typeof w.start !== 'number' || typeof w.end !== 'number') continue
          allWords.push({ word: String(w.word).trim(), start: w.start + c.start_sec, end: w.end + c.start_sec })
        }
      }
    } else {
      // Single-blob path: prefer the audio_extract artifact, fall back to source.
      const audioKey = vlog.mime_type.startsWith('video/')
        ? `${vlog.operator_id}/audio/${vlog.id}/mp3.full`
        : vlog.r2_key
      await this.recordEvent(vlog.id, 'transcribe', 'running', 'load_audio', { r2_key: audioKey })
      const obj = await this.env.VIDEOS.get(audioKey)
      if (!obj) throw new Error(`audio missing from R2: ${audioKey}`)
      const bytes = new Uint8Array(await obj.arrayBuffer())
      await this.recordEvent(vlog.id, 'transcribe', 'running', 'whisper_call',
        { bytes: bytes.byteLength, attempt: 1 })
      const result = await this.whisperWithRetry(bytes, 0, 1)
      stitched = result?.text ?? result?.transcription ?? ''
      const wordList: any[] = Array.isArray(result?.words) ? result.words : []
      for (const w of wordList) {
        if (!w.word || typeof w.start !== 'number' || typeof w.end !== 'number') continue
        allWords.push({ word: String(w.word).trim(), start: w.start, end: w.end })
      }
    }

    if (!stitched) throw new Error('Whisper returned empty transcript')

    await this.env.DB.prepare(
      `UPDATE vlogs SET transcript_text = ?, transcript_provider = 'workers_ai_whisper',
                        transcript_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    ).bind(stitched, vlog.id).run()

    if (allWords.length > 0) {
      const stmts = allWords.map((w, idx) =>
        this.env.DB.prepare(
          `INSERT INTO transcript_words (vlog_id, operator_id, word, start_time, end_time, word_index)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(vlog_id, word_index) DO NOTHING`,
        ).bind(vlog.id, vlog.operator_id, w.word, w.start, w.end, idx),
      )
      const CHUNK = 100
      for (let i = 0; i < stmts.length; i += CHUNK) {
        try { await this.env.DB.batch(stmts.slice(i, i + CHUNK)) } catch {}
      }
    }

    await this.setVlogState(vlog.id, 'transcribed', null)
  }

  private async whisperWithRetry(
    bytes: Uint8Array,
    chunkIdx: number,
    totalChunks: number,
  ): Promise<any> {
    const MAX = 4
    let lastErr: any
    // runWhisper handles the input-shape detection (object/body, array,
    // base64) and caches the working shape per isolate. We only retry on
    // transient failures (network, rate limit) here — schema mismatches
    // are exhaustively tried inside runWhisper itself, so a thrown error
    // here means we've already burned through every plausible shape.
    for (let attempt = 1; attempt <= MAX; attempt++) {
      try {
        return await runWhisper(this.env as any, bytes)
      } catch (err: any) {
        lastErr = err
        const msg = String(err?.message ?? err ?? '')
        // Don't retry on the all-shapes-failed error — it's terminal.
        if (/failed across all input shapes/i.test(msg)) break
        if (attempt < MAX) {
          const wait = backoffMs(attempt)
          await new Promise(r => setTimeout(r, wait))
        }
      }
    }
    throw new Error(
      `Whisper failed on chunk ${chunkIdx + 1}/${totalChunks} after ${MAX} attempts ` +
      `(${bytes.byteLength} bytes): ${lastErr?.message || lastErr}`,
    )
  }

  /**
   * extract: single LLM call → threads + clips + creative + entities.
   * 4-gram validator runs; if mode=auto and failRate > 0.15, escalates
   * to Sonnet 4.6. Provenance recorded in extraction_runs.
   *
   * Skip if: an extraction_runs row with is_active=1 already exists
   *          for this vlog (re-extract bypasses with force=true).
   */
  private async stepExtract(vlog: VlogRow, mode: ExtractionMode): Promise<void> {
    const transcript = await this.env.DB.prepare(
      `SELECT transcript_text FROM vlogs WHERE id = ?`,
    ).bind(vlog.id).first<{ transcript_text: string | null }>()
    if (!transcript?.transcript_text || transcript.transcript_text.length < 20) {
      throw new Error(`transcript_text missing or too short: ${transcript?.transcript_text?.length ?? 0} chars`)
    }

    const progress = async (sub: string, payload: Record<string, unknown>) => {
      const state = (payload.state as string | undefined) === 'ok' ? 'ok'
        : (payload.state as string | undefined) === 'error' ? 'failed'
        : 'running'
      await this.recordEvent(vlog.id, 'extract', state, sub, payload)
    }

    const run = await runExtraction(
      this.env as unknown as { AI: { run: (m: string, i: any, o?: any) => Promise<any> }; ANTHROPIC_API_KEY?: string },
      transcript.transcript_text,
      mode,
      progress,
    )
    const run_id = ulid()
    const r2_key = `${vlog.operator_id}/extractions/${vlog.id}/${run_id}.json`
    try {
      await this.env.VIDEOS.put(r2_key, JSON.stringify(run.payload), {
        httpMetadata: { contentType: 'application/json' },
      })
    } catch {}

    await this.env.DB.prepare(
      `UPDATE extraction_runs SET is_active = 0 WHERE vlog_id = ? AND is_active = 1`,
    ).bind(vlog.id).run()
    await this.env.DB.prepare(
      `INSERT INTO extraction_runs
         (id, vlog_id, operator_id, model, escalated_from, mode, r2_key,
          total_items, invalid_items, fail_rate, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(
      run_id, vlog.id, vlog.operator_id, run.model, run.escalated_from ?? null, mode,
      r2_key, run.total_items, run.invalid_items, run.fail_rate, Date.now(),
    ).run()

    // Persist the 60-120 word summary so /timeline/[id] renders it inline.
    if (run.payload.summary && run.payload.summary.length > 10) {
      try {
        await this.env.DB.prepare(
          `UPDATE vlogs SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(run.payload.summary, vlog.id).run()
      } catch (err: any) {
        console.warn('[extract] vlogs.summary write failed:', err?.message || err)
      }
    }

    // Flatten into existing tables. One .batch per kind so a single bad
    // INSERT shape (e.g. an unmigrated NOT NULL column) reports loudly
    // instead of dropping everything in the chunk silently.
    const promptVersion = 'unified-v1'
    const persisted: Record<string, number> = { threads: 0, clips: 0, creative: 0, entities: 0 }
    const expected: Record<string, number> = {
      threads: run.payload.threads.length,
      clips: run.payload.clips.length,
      creative: run.payload.creative_elements.length,
      entities: run.payload.entities.length,
    }

    const runBatch = async (kind: string, stmts: any[]) => {
      if (stmts.length === 0) return
      const CHUNK = 50
      for (let i = 0; i < stmts.length; i += CHUNK) {
        const slice = stmts.slice(i, i + CHUNK)
        try {
          await this.env.DB.batch(slice)
          persisted[kind] += slice.length
        } catch (err: any) {
          console.warn(`[extract] ${kind} batch failed at i=${i}: ${err?.message || err}`)
          for (const stmt of slice) {
            try { await stmt.run(); persisted[kind] += 1 } catch (innerErr: any) {
              console.warn(`[extract] ${kind} single insert failed: ${innerErr?.message || innerErr}`)
            }
          }
        }
      }
    }

    await runBatch('threads', run.payload.threads.map(t => this.env.DB.prepare(
      `INSERT INTO threads
         (id, operator_id, vlog_id, run_id, topic, take, key_quotes, register, validated, extraction_prompt_version, extracted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      ulid(), vlog.operator_id, vlog.id, run_id,
      String(t.topic || '').slice(0, 200),
      String(t.take || ''),
      JSON.stringify(t.key_quotes ?? []),
      String(t.register || 'observation'),
      t.validated ?? 1,
      promptVersion,
    )))

    await runBatch('clips', run.payload.clips.map(c => this.env.DB.prepare(
      `INSERT INTO clip_candidates
         (id, operator_id, vlog_id, run_id, start_time, end_time, headline, quote, why_clippable, validated, status, extraction_prompt_version, extracted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)`,
    ).bind(
      ulid(), vlog.operator_id, vlog.id, run_id,
      c.start_time_ms != null ? c.start_time_ms / 1000 : 0,
      c.end_time_ms != null ? c.end_time_ms / 1000 : 0,
      String(c.headline || '').slice(0, 200),
      String(c.quote || ''),
      JSON.stringify({ reason: c.why_clippable ?? '' }),
      c.validated ?? 1,
      promptVersion,
    )))

    await runBatch('creative', run.payload.creative_elements.map(e => this.env.DB.prepare(
      `INSERT INTO creative_elements
         (id, operator_id, vlog_id, run_id, element_type, content, validated, extraction_prompt_version, extracted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      ulid(), vlog.operator_id, vlog.id, run_id,
      String(e.element_type || 'theme'),
      String(e.content || ''),
      e.validated ?? 1,
      promptVersion,
    )))

    await runBatch('entities', run.payload.entities.map(ent => this.env.DB.prepare(
      `INSERT INTO entities
         (id, operator_id, vlog_id, run_id, name, entity_type, mention_count, first_mentioned_at, last_mentioned_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).bind(
      ulid(), vlog.operator_id, vlog.id, run_id,
      String(ent.name || '').slice(0, 200),
      String(ent.entity_type || 'concept'),
    )))

    const warnings: Record<string, { expected: number; persisted: number }> = {}
    for (const kind of Object.keys(expected)) {
      if (persisted[kind] < expected[kind]) {
        warnings[kind] = { expected: expected[kind], persisted: persisted[kind] }
      }
    }
    if (Object.keys(warnings).length > 0) {
      await progress('persist_warnings', { state: 'warn', run_id, warnings })
    }

    await progress('llm_persist', {
      state: 'ok', run_id, model: run.model,
      threads: persisted.threads,
      clips: persisted.clips,
      creative_elements: persisted.creative,
      entities: persisted.entities,
      fail_rate: run.fail_rate,
    })

    try {
      const surfaceResult = await surfaceFromRun(
        { db: this.env.DB, vlog_id: vlog.id, operator_id: vlog.operator_id, run_id },
        run.payload.threads as any,
      )
      await progress('surface', {
        state: 'ok',
        inserted: surfaceResult.inserted,
        errors: surfaceResult.errors.length,
      })
    } catch (err: any) {
      console.warn(`[surface] failed for run ${run_id}: ${err?.message || err}`)
    }
  }

  // ── DO helpers ──
  private async loadVlog(vlog_id: string): Promise<VlogRow | null> {
    const row = await this.env.DB.prepare(
      `SELECT id, operator_id, r2_key, mime_type, transcript_text,
              audio_chunks_json, thumbnail_r2_key, transcoded_r2_key
         FROM vlogs WHERE id = ?`,
    ).bind(vlog_id).first<VlogRow>()
    return row ?? null
  }

  private async artifactExists(vlog: VlogRow, step: StepKey): Promise<boolean> {
    if (step === 'audio_extract') {
      // Skip if chunks set OR mp3 already on R2 OR transcript already exists
      if (vlog.audio_chunks_json) return true
      if (vlog.transcript_text) return true
      if (!vlog.mime_type.startsWith('video/')) return true // audio source: nothing to extract
      const key = `${vlog.operator_id}/audio/${vlog.id}/mp3.full`
      const head = await this.env.VIDEOS.head(key)
      return head != null
    }
    if (step === 'transcribe') {
      return Boolean(vlog.transcript_text)
    }
    if (step === 'extract') {
      const row = await this.env.DB.prepare(
        `SELECT 1 AS one FROM extraction_runs WHERE vlog_id = ? AND is_active = 1 LIMIT 1`,
      ).bind(vlog.id).first<{ one: number }>()
      return Boolean(row)
    }
    return false
  }

  private async advance(current: StepKey): Promise<void> {
    const idx = STEPS.indexOf(current)
    if (idx < 0 || idx >= STEPS.length - 1) {
      // pipeline done
      const vlog_id = await this.state.storage.get<string>('vlog_id')
      if (vlog_id) await this.setVlogState(vlog_id, 'ready', null)
      await this.state.storage.delete('pointer')
      return
    }
    await this.state.storage.put('pointer', STEPS[idx + 1])
  }

  private async clearAttempts(): Promise<void> {
    for (const s of STEPS) await this.state.storage.delete(`attempts:${s}`)
  }

  private async setVlogState(vlog_id: string, state: string, error: string | null): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE vlogs SET state = ?, state_error = ?, pipeline_status = ?,
                        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    ).bind(state, error, mapStateToLegacyPipelineStatus(state), vlog_id).run()
  }

  private async recordEvent(
    vlog_id: string,
    step: string,
    status: string,
    sub_step: string | null,
    detail: Record<string, unknown>,
    error_full_text: string | null = null,
  ): Promise<void> {
    // Resolve operator_id by preference: DO storage (set in /start), then
    // re-load from D1 if missing. The /events query on the Pages side filters
    // by operator_id, so an empty/wrong value here would silently hide the
    // event from the UI even though the row landed in D1.
    let operator_id = (await this.state.storage.get<string>('operator_id')) ?? ''
    if (!operator_id) {
      const row = await this.env.DB.prepare(
        `SELECT operator_id FROM vlogs WHERE id = ?`,
      ).bind(vlog_id).first<{ operator_id: string }>()
      operator_id = row?.operator_id ?? ''
      if (operator_id) await this.state.storage.put('operator_id', operator_id)
    }
    const event = {
      vlog_id, operator_id, step, sub_step,
      status,
      detail_json: JSON.stringify(detail),
      duration_ms: typeof detail.duration_ms === 'number' ? detail.duration_ms : null,
      error_full_text,
      attempt: typeof detail.attempt === 'number' ? detail.attempt : 1,
      ts: Date.now(),
    }
    const id = await insertEvent(this.env.DB, event)
    // Broadcast to local WS clients
    const sockets = this.state.getWebSockets()
    const payload = JSON.stringify({ type: 'event', event: { ...event, id } })
    for (const ws of sockets) {
      try { ws.send(payload) } catch {}
    }
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {}
  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {}
  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> {}
}

function stateForStep(step: StepKey): string {
  switch (step) {
    case 'audio_extract': return 'processing'
    case 'transcribe': return 'processing'
    case 'extract': return 'extracting'
  }
}

// Map the new `state` column values to the legacy `pipeline_status` so
// existing reads (chat tools, list views) keep working during cutover.
function mapStateToLegacyPipelineStatus(state: string): string {
  switch (state) {
    case 'queued': return 'uploaded'
    case 'processing': return 'transcoding'
    case 'transcribed': return 'transcribing'
    case 'extracting': return 'extracting'
    case 'ready': return 'complete'
    case 'failed': return 'failed'
    default: return state
  }
}
