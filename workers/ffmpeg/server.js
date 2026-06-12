/**
 * Neolog FFmpeg Container Worker — HTTP server.
 *
 * Listens on PORT (default 8080). Each endpoint reads input from a presigned
 * R2 GET URL, runs ffmpeg, and streams the output back in the HTTP response.
 *
 * The main Worker is responsible for: presigning the R2 URL on the way in,
 * uploading the response body to R2 on the way out. This container stays
 * stateless — no R2 credentials inside, no disk persistence beyond /tmp.
 *
 * Endpoints:
 *   POST /transcode-h264               { input_url }              -> mp4 (H.264+AAC)
 *   POST /extract-thumb                { input_url, t? }          -> jpg
 *   POST /extract-thumb-mini-transcode { input_url, t? }          -> jpg
 *       Mini-transcode fallback for HEVC verticals where /extract-thumb returns
 *       0 bytes due to malformed rotation metadata. Decodes only 2 seconds of
 *       input into H.264 then grabs one frame. ~5s instead of ~5-10min.
 *   POST /extract-audio    { input_url }                  -> mp3
 *   POST /trim             { input_url, start_s, end_s }  -> trimmed mp4
 *   POST /concat           { input_urls: string[] }       -> concatenated mp4
 *   GET  /health                                          -> "ok"
 *
 * All POST bodies are JSON. Errors return 4xx/5xx with text/plain message.
 *
 * LOCKED PIPELINE COMPATIBILITY: /transcode-h264 produces an MP4 that strips
 * rotation metadata (via -vf "transpose=..." when needed) so a subsequent
 * /extract-thumb call returns valid frames on DJI Mimo HEVC vertical videos.
 * This mirrors the existing Replicate fofr/toolkit behavior.
 */

import http from 'node:http'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { mkdtempSync, createReadStream, createWriteStream, statSync, rmSync, readdirSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { join } from 'node:path'

const PORT = parseInt(process.env.PORT || '8080', 10)

// Fail loudly if anything below crashes before server.listen() can fire.
// Without this, a SyntaxError or import failure produces a silent exit and
// Cloudflare just records "container not running" with zero logs. With this
// the cause is visible in `wrangler tail` and the dashboard logs.
process.on('uncaughtException', err => {
  console.error('[neolog-ffmpeg] BOOT FAILURE (uncaughtException):', err && err.stack || err)
  process.exit(1)
})
process.on('unhandledRejection', (reason, p) => {
  console.error('[neolog-ffmpeg] BOOT FAILURE (unhandledRejection):', reason)
  process.exit(1)
})
console.log(`[neolog-ffmpeg] booting on port ${PORT}, node ${process.version}, pid ${process.pid}`)

// ─── helpers ─────────────────────────────────────────────────────────────────

function jsonError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain' })
  res.end(message)
}

async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { throw new Error('Body must be JSON') }
}

/**
 * Stream a URL to a temp file on disk. Returns the temp file path.
 *
 * For thumbnail use: a `rangeBytes` argument tells us to fetch ONLY the first
 * N bytes via HTTP Range. Most camera-recorded MP4s are fast-start (moov at
 * the front), so the first 200 MB has the header + plenty of frames for a
 * thumbnail at t=1. Avoids downloading 9 GB just to grab one frame.
 *
 * If the upstream throws (file too large, network error, etc.) the temp dir
 * we created is cleaned up before re-throwing — leaks here are what
 * eventually fill /tmp and trigger ENOSPC across all subsequent requests.
 *
 * Previously used Buffer.from(await resp.arrayBuffer()) which loaded the
 * entire file into RAM — fatal on the standard-1 container (256 MB) for big
 * files. Streaming via pipeline() keeps peak memory at a small constant
 * regardless of file size.
 */
async function downloadToTmp(url, label, opts = {}) {
  const maxBytes = opts.maxBytes ?? 4 * 1024 * 1024 * 1024
  const rangeBytes = opts.rangeBytes ?? null
  const tmp = mkdtempSync(join(tmpdir(), `neolog-ffmpeg-${label}-`))
  try {
    const tmpFile = join(tmp, 'input')
    const headers = rangeBytes ? { Range: `bytes=0-${rangeBytes - 1}` } : undefined
    const resp = await fetch(url, headers ? { headers } : undefined)
    if (!resp.ok && resp.status !== 206) {
      throw new Error(`Fetch ${label} failed: HTTP ${resp.status}`)
    }
    const len = parseInt(resp.headers.get('content-length') || '0', 10)
    if (!rangeBytes && len && len > maxBytes) {
      throw new Error(`Input too large: ${len} > ${maxBytes} (use rangeBytes for partial fetch)`)
    }
    if (!resp.body) throw new Error(`Fetch ${label} returned empty body`)
    const nodeReadable = Readable.fromWeb(resp.body)
    await pipeline(nodeReadable, createWriteStream(tmpFile))
    return { dir: tmp, file: tmpFile }
  } catch (err) {
    // Don't leak the temp dir on failure — that's what fills /tmp and
    // turns the next request into ENOSPC.
    cleanup(tmp)
    throw err
  }
}

// One-shot sweep on container start: drop any neolog-ffmpeg-* dirs left over
// from a prior crash / OOM. Without this, restart inherits the leak.
function sweepStaleTmpDirs() {
  try {
    for (const name of readdirSync(tmpdir())) {
      if (name.startsWith('neolog-ffmpeg-')) {
        try { rmSync(join(tmpdir(), name), { recursive: true, force: true }) } catch {}
      }
    }
  } catch {}
}
sweepStaleTmpDirs()

/**
 * Spawn ffmpeg with the given args. Resolves with the output file path
 * once ffmpeg exits 0. Rejects with stderr text on non-zero exit.
 */
function runFfmpeg(args, outFile) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => reject(err))
    proc.on('exit', code => {
      if (code === 0) resolve(outFile)
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`))
    })
  })
}

/**
 * Like runFfmpeg, but returns the full stderr text on success so the caller
 * can include it in diagnostic output (e.g., when ffmpeg exits 0 but produces
 * a tiny / empty output file). On non-zero exit, throws with stderr included.
 */
function runFfmpegCapture(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => reject(err))
    proc.on('exit', code => {
      if (code === 0) resolve(stderr)
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`))
    })
  })
}

/**
 * Run ffprobe and return parsed JSON, or throw with stderr.
 *
 * Used by /extract-audio to detect inputs with no audio stream BEFORE
 * burning 5 strategies on them. DJI Mimo slow-mo (120/240 fps) records
 * video-only — the audio track is omitted because stretched audio would
 * sound awful. FFmpeg's `-c:a copy` (and the other 4 codec strategies)
 * all exit 234 / EINVAL when asked to extract a non-existent stream,
 * and the stderr is just the build banner. Probing first lets us return
 * `{ ok: true, no_audio: true }` so the pipeline marks the vlog as
 * b-roll instead of failing.
 */
function ffprobeJson(inputFile) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      inputFile,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => reject(err))
    proc.on('exit', code => {
      if (code !== 0) return reject(new Error(`ffprobe exit ${code}: ${stderr.slice(-1500)}`))
      try { resolve(JSON.parse(stdout)) }
      catch (e) { reject(new Error(`ffprobe returned non-JSON: ${e.message}`)) }
    })
  })
}

function streamFile(res, filePath, contentType) {
  const stat = statSync(filePath)
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
  })
  createReadStream(filePath).pipe(res)
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }) } catch {}
}

// ─── endpoint: /transcode-h264 ───────────────────────────────────────────────
// Re-encodes any input to H.264 + AAC in an MP4 container. Strips rotation
// metadata implicitly via the re-encode (which is what the locked pipeline
// requires so subsequent thumbnail extraction works on DJI HEVC verticals).
async function transcodeH264(body, res) {
  const { input_url } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')

  const { dir, file: inputFile } = await downloadToTmp(input_url, 'transcode-in')
  const outFile = join(dir, 'out.mp4')
  try {
    await runFfmpeg([
      '-y',
      '-i', inputFile,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      // Re-encode strips rotation metadata; explicit -metadata:s:v:0 rotate=0
      // is a no-op once re-encoded but keeps intent visible.
      '-metadata:s:v:0', 'rotate=0',
      outFile,
    ], outFile)
    streamFile(res, outFile, 'video/mp4')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, err.message)
  }
}

// ─── endpoint: /extract-thumb ────────────────────────────────────────────────
// Streams the R2 fetch directly to ffmpeg's stdin. No temp file, no size
// cap, no Range guesswork. ffmpeg reads the moov atom + first few frames,
// outputs a JPEG, and exits. The R2 connection closes naturally when ffmpeg
// closes its stdin.
//
// Why streaming:
//   - Earlier "fetch first 200MB then run ffmpeg on disk file" approach broke
//     for many files: a truncated MP4 triggered ffmpeg exit 183 with only
//     the banner in stderr (cryptic non-decode error).
//   - Disk-based approach also leaked /tmp on errors → ENOSPC cascade.
//   - Streaming sidesteps both: zero disk, zero size cap, zero Range guess.
//
// Constraint: requires fast-start MP4 (moov at the front of the file). All
// modern camera-recorded files are fast-start. Edited / re-encoded files
// may not be — those fall to /extract-thumb-mini-transcode.
async function extractThumb(body, res) {
  const { input_url, t } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')
  const seekTime = typeof t === 'number' && t >= 0 ? t : 1.0
  await streamingExtract(input_url, seekTime, res, /*miniTranscode*/ false)
}

// ─── endpoint: /extract-thumb-mini-transcode ─────────────────────────────────
// Fallback: same streaming approach but routes the input through libx264
// re-encode for 2 seconds, then grabs one frame. Catches the rare case
// where the direct decode path can't grok the source codec.
async function extractThumbMiniTranscode(body, res) {
  const { input_url, t } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')
  const seekTime = typeof t === 'number' && t >= 0 ? t : 1.0
  await streamingExtract(input_url, seekTime, res, /*miniTranscode*/ true)
}

/**
 * Shared streaming extraction. Pipes a fetch response into ffmpeg's stdin
 * and collects the JPEG bytes from stdout. Hard 20s timeout. Returns the
 * JPEG to the HTTP response, or 500 with stderr on failure.
 */
async function streamingExtract(inputUrl, seekTime, res, miniTranscode) {
  const args = miniTranscode
    ? [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-t', '4',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-an',
        '-vf', 'scale=320:-2',
        '-frames:v', '1',
        '-q:v', '4',
        '-f', 'image2',
        '-vcodec', 'mjpeg',
        'pipe:1',
      ]
    : [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-ss', String(seekTime),
        '-frames:v', '1',
        '-vf', 'scale=320:-2',
        '-q:v', '4',
        '-f', 'image2',
        '-vcodec', 'mjpeg',
        'pipe:1',
      ]

  return new Promise(resolve => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const out = []
    let outSize = 0
    let stderr = ''
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      resolve()
    }
    proc.stdout.on('data', chunk => { out.push(chunk); outSize += chunk.length })
    proc.stderr.on('data', chunk => { stderr += chunk.toString() })
    // Ignore EPIPE when ffmpeg closes stdin after reading enough
    proc.stdin.on('error', () => {})

    // Hard timeout — kill ffmpeg if it hasn't produced output in 20s
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
    }, 20_000)

    proc.on('exit', (code, signal) => {
      clearTimeout(killTimer)
      if (outSize >= 1024) {
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(outSize),
        })
        for (const c of out) res.write(c)
        res.end()
      } else {
        const reason = signal
          ? `killed by ${signal} (timeout?)`
          : `exit ${code}, output ${outSize}b`
        const stderrShown = stderr.trim() || '(no stderr)'
        jsonError(res, 500, `ffmpeg ${reason}. stderr: ${stderrShown.slice(0, 1500)}`)
      }
      finish()
    })
    proc.on('error', err => {
      clearTimeout(killTimer)
      jsonError(res, 500, `ffmpeg spawn error: ${err.message}`)
      finish()
    })

    // Pipe the R2 fetch into ffmpeg's stdin
    fetch(inputUrl).then(resp => {
      if (!resp.ok && resp.status !== 206) {
        try { proc.kill('SIGKILL') } catch {}
        jsonError(res, 500, `R2 fetch ${resp.status}`)
        finish()
        return
      }
      if (!resp.body) {
        try { proc.kill('SIGKILL') } catch {}
        jsonError(res, 500, 'R2 fetch returned empty body')
        finish()
        return
      }
      const reader = Readable.fromWeb(resp.body)
      reader.on('error', err => {
        try { proc.kill('SIGKILL') } catch {}
        // The error response was already prepared by the proc.on('exit') handler;
        // if it hasn't fired yet, surface the read error.
        if (!resolved) {
          jsonError(res, 500, `R2 read error: ${err.message}`)
          finish()
        }
      })
      reader.pipe(proc.stdin)
    }).catch(err => {
      try { proc.kill('SIGKILL') } catch {}
      jsonError(res, 500, `R2 fetch threw: ${err.message}`)
      finish()
    })
  })
}

// ─── endpoint: /extract-audio ────────────────────────────────────────────────
// Pulls audio out as MP3 for transcription. Whisper handles MP3 fine.
//
// Accepts optional heartbeat_url + heartbeat_token + vlog_id + operator_id
// in the request body. When supplied, posts ffmpeg's -progress pipe:1 output
// to that URL roughly once per second so the live UI shows byte/time-level
// progress instead of a static "Video transcode ⋯" placeholder for minutes.
async function extractAudio(body, res) {
  const { input_url, heartbeat_url, heartbeat_token, vlog_id, operator_id } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')

  const { dir, file: inputFile } = await downloadToTmp(input_url, 'audio-in')

  const beat = makeHeartbeat({
    url: heartbeat_url,
    token: heartbeat_token,
    vlog_id,
    operator_id,
    step: 'audio_extract',
  })

  // Pre-flight: probe the input to check for an audio stream. If there
  // isn't one (DJI Mimo slow-mo records video-only, GoPro / iPhone time-
  // lapses are silent, some screen recordings, etc.) we return a clear
  // "no audio" signal instead of grinding through 5 codec strategies
  // that all fail with FFmpeg's unhelpful EINVAL/build-banner combo.
  //
  // The caller (pipeline DO) treats `no_audio: true` as a successful
  // result with empty transcript, which flows through the existing
  // b-roll classification path (transcript_len < 200 + 0 items).
  try {
    await beat('running', 'probe', { state: 'probing' })
    const probe = await ffprobeJson(inputFile)
    const audioStreams = (probe.streams || []).filter(s => s.codec_type === 'audio')
    if (audioStreams.length === 0) {
      const videoStreams = (probe.streams || []).filter(s => s.codec_type === 'video')
      const v = videoStreams[0] || {}
      await beat('ok', 'probe', {
        state: 'no_audio',
        reason: 'input_has_no_audio_stream',
        video_codec: v.codec_name || null,
        video_fps: v.r_frame_rate || null,
        duration_sec: probe.format?.duration ? parseFloat(probe.format.duration) : null,
        note: 'Likely DJI slow-mo, time-lapse, or other silent recording. Returning empty audio signal so the pipeline marks the vlog as b-roll instead of failing.',
      })
      cleanup(dir)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        no_audio: true,
        video_codec: v.codec_name || null,
        video_fps: v.r_frame_rate || null,
        duration_sec: probe.format?.duration ? parseFloat(probe.format.duration) : null,
      }))
      return
    }
  } catch (err) {
    // If ffprobe itself fails the input really IS unreadable. Fall
    // through to the strategy cascade — its error message will be more
    // diagnostic than ffprobe's, and a strategy *might* still squeeze
    // audio out.
    await beat('retrying', 'probe', {
      state: 'probe_failed_falling_back',
      error: String(err?.message || err).slice(0, 800),
    })
  }

  // Audio extraction strategies, tried in order until one succeeds.
  // Each previous strategy got stuck on roughly 1 in 5 vlogs with
  // ffmpeg exit 234 + just the build banner in stderr — a sign that
  // ffmpeg rejected the codec/format/args at startup, before doing
  // any work. The cascade tries progressively more permissive paths:
  //
  //   1. libmp3lame   — the original path. Smallest output, but
  //                     requires libmp3lame in the FFmpeg build.
  //   2. native MP3   — FFmpeg's built-in MP3 encoder, no external lib.
  //   3. AAC          — always built into FFmpeg. Output .m4a.
  //   4. PCM WAV      — codec-free, always works as long as decode works.
  //   5. stream copy  — no re-encode at all; just demux the audio.
  //
  // Whisper accepts all of these.
  const strategies = [
    { name: 'libmp3lame', ext: 'mp3', mime: 'audio/mpeg',
      audio_args: ['-c:a', 'libmp3lame', '-b:a', '128k'] },
    { name: 'mp3_native', ext: 'mp3', mime: 'audio/mpeg',
      audio_args: ['-c:a', 'mp3', '-b:a', '128k'] },
    { name: 'aac',        ext: 'm4a', mime: 'audio/mp4',
      audio_args: ['-c:a', 'aac', '-b:a', '128k'] },
    { name: 'pcm_wav',    ext: 'wav', mime: 'audio/wav',
      audio_args: ['-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1'] },
    { name: 'copy',       ext: 'mka', mime: 'audio/x-matroska',
      audio_args: ['-c:a', 'copy'] },
  ]

  await beat('starting', 'ffmpeg', { state: 'starting' })

  let lastErr = null
  let lastStrategy = null
  for (let i = 0; i < strategies.length; i++) {
    const s = strategies[i]
    const outFile = join(dir, `audio.${s.ext}`)
    try {
      await beat('running', 'ffmpeg_strategy', { state: 'running', strategy: s.name, attempt: i + 1 })
      await runFfmpegWithProgress(
        [
          '-y',
          '-progress', 'pipe:1',
          // -err_detect ignore_err + lenient fflags let FFmpeg get past
          // minor input corruption / unusual timestamps that would
          // otherwise abort decoding. Safe to set globally — they don't
          // affect output quality for clean input.
          '-err_detect', 'ignore_err',
          '-fflags', '+genpts+ignidx+igndts',
          '-i', inputFile,
          '-vn',
          ...s.audio_args,
          outFile,
        ],
        beat,
      )
      await beat('ok', 'ffmpeg', { state: 'ok', strategy: s.name, attempt: i + 1 })
      streamFile(res, outFile, s.mime)
      res.on('close', () => cleanup(dir))
      return
    } catch (err) {
      lastErr = err
      lastStrategy = s.name
      // Capture the full error per-strategy so the diagnostic shows
      // exactly which path failed and why.
      await beat('retrying', 'ffmpeg_strategy', {
        state: 'retrying', strategy: s.name, attempt: i + 1,
        error: String(err?.message || err).slice(0, 800),
      })
    }
  }

  // All strategies failed. Surface a detailed error with the LAST stderr
  // (where the actual FFmpeg complaint lives — earlier 'first 500
  // chars' captured the build banner and lost the real message).
  cleanup(dir)
  await beat('error', 'ffmpeg', {
    state: 'error',
    strategies_tried: strategies.length,
    last_strategy: lastStrategy,
    error: String(lastErr?.message || lastErr).slice(0, 1000),
  })
  jsonError(res, 500,
    `ffmpeg /extract-audio failed across ${strategies.length} strategies. ` +
    `Last (${lastStrategy}): ${String(lastErr?.message || lastErr).slice(0, 1500)}`,
  )
}

/**
 * Build a heartbeat-poster closure. If url/token/vlog_id are missing
 * (synchronous internal calls), returns a no-op so callers don't have to
 * branch.
 */
function makeHeartbeat({ url, token, vlog_id, operator_id, step }) {
  if (!url || !token || !vlog_id || !operator_id) {
    return async () => {}
  }
  const target = `${url.replace(/\/+$/, '')}/event/${vlog_id}`
  return async (status, sub_step, detail) => {
    try {
      await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Heartbeat-Token': token,
        },
        body: JSON.stringify({
          operator_id,
          step,
          sub_step,
          status,
          detail_json: JSON.stringify(detail ?? {}),
          ts: Date.now(),
        }),
      })
    } catch (err) {
      // Heartbeats are observability; never let a failed POST break the job.
      console.warn(`[heartbeat] ${target} failed: ${err?.message || err}`)
    }
  }
}

/**
 * Run ffmpeg with -progress pipe:1 and forward progress events to the
 * heartbeat poster ~1× per second.
 *
 * ffmpeg's progress output is a stream of key=value lines terminated by
 * `progress=continue` or `progress=end`. Example:
 *   frame=143
 *   fps=28.5
 *   stream_0_0_q=0.0
 *   bitrate=128.0kbits/s
 *   total_size=2256896
 *   out_time_us=141312000
 *   out_time_ms=141312
 *   out_time=00:02:21.312000
 *   speed=2.31x
 *   progress=continue
 *
 * We parse, emit at ~1s cadence, and keep stderr accumulated for the
 * non-zero-exit error message.
 */
function runFfmpegWithProgress(args, beat) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let buf = ''
    let pending = {}
    let lastEmit = 0
    const flush = async (force) => {
      const now = Date.now()
      if (!force && now - lastEmit < 1000) return
      if (Object.keys(pending).length === 0) return
      lastEmit = now
      const out_time_us = parseInt(pending.out_time_us || pending.out_time_ms * 1000 || '0', 10)
      const speed = pending.speed ? parseFloat(pending.speed) : null
      await beat('running', 'ffmpeg', {
        state: 'running',
        time_sec: out_time_us / 1_000_000,
        speed_x: speed,
        total_size: pending.total_size ? parseInt(pending.total_size, 10) : null,
        bitrate: pending.bitrate || null,
      })
    }
    proc.stdout.on('data', async (d) => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const eq = line.indexOf('=')
        if (eq < 0) continue
        const k = line.slice(0, eq).trim()
        const v = line.slice(eq + 1).trim()
        if (k === 'progress') {
          // 'continue' or 'end' → snapshot ready
          await flush(v === 'end')
          pending = {}
        } else {
          pending[k] = v
        }
      }
    })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => reject(err))
    proc.on('exit', code => {
      if (code === 0) resolve()
      // Show the LAST 4000 chars of stderr. FFmpeg prints its build
      // banner FIRST (~1500 chars), then any actual errors LAST. The
      // old 2000-char tail was sometimes still inside the banner for
      // verbose builds, producing useless errors like "le-shared
      // --enable-vaapi --enable-vdpau..." with no actual diagnostic.
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-4000)}`))
    })
  })
}

// ─── endpoint: /trim ─────────────────────────────────────────────────────────
// Cut a span from a source video. Used for clip publishing.
async function trim(body, res) {
  const { input_url, start_s, end_s } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')
  if (typeof start_s !== 'number' || typeof end_s !== 'number' || end_s <= start_s) {
    return jsonError(res, 400, 'start_s + end_s required (numbers, end > start)')
  }

  const { dir, file: inputFile } = await downloadToTmp(input_url, 'trim-in')
  const outFile = join(dir, 'trimmed.mp4')
  try {
    await runFfmpeg([
      '-y',
      '-i', inputFile,
      '-ss', String(start_s),
      '-to', String(end_s),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outFile,
    ], outFile)
    streamFile(res, outFile, 'video/mp4')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, err.message)
  }
}

// ─── endpoint: /concat ───────────────────────────────────────────────────────
// Concatenate multiple input urls into one mp4. Used for clip assembly +
// final video_essay composition. Each input is re-encoded to a common
// codec/framerate first so concat is reliable across mixed sources.
async function concat(body, res) {
  const { input_urls } = body
  if (!Array.isArray(input_urls) || input_urls.length < 2) {
    return jsonError(res, 400, 'input_urls array of length >= 2 required')
  }

  const dirs = []
  const segmentFiles = []
  try {
    // Download all segments in parallel
    const downloads = await Promise.all(
      input_urls.map((u, i) => downloadToTmp(u, `concat-${i}`))
    )
    downloads.forEach(d => dirs.push(d.dir))

    // Normalize each into the same codec/timebase so concat is clean
    const normalized = []
    for (let i = 0; i < downloads.length; i++) {
      const norm = join(downloads[i].dir, 'norm.mp4')
      await runFfmpeg([
        '-y',
        '-i', downloads[i].file,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1920:-2,fps=30',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '2',
        norm,
      ], norm)
      normalized.push(norm)
      segmentFiles.push(norm)
    }

    // Write concat manifest
    const manifestDir = mkdtempSync(join(tmpdir(), 'neolog-concat-manifest-'))
    dirs.push(manifestDir)
    const manifestPath = join(manifestDir, 'list.txt')
    await writeFile(
      manifestPath,
      normalized.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    )

    const outFile = join(manifestDir, 'concat.mp4')
    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', manifestPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outFile,
    ], outFile)

    streamFile(res, outFile, 'video/mp4')
    res.on('close', () => dirs.forEach(cleanup))
  } catch (err) {
    dirs.forEach(cleanup)
    jsonError(res, 500, err.message)
  }
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

// ── endpoint: /extract-audio-segment ───────────────────────────────
// Slices the vlog's audio between start_sec and (start_sec + duration_sec)
// into an MP3, streamed back to the caller. Used by the Thread page
// "Play thread segment only" toggle so the operator can audition just
// the span of audio that produced a thread, without scrubbing through
// the full vlog.
//
// Output is streamed straight to the response body. Caller is expected
// to upload it to R2 (or proxy through their own R2 PUT URL) and cache
// the result for subsequent requests.
async function extractAudioSegment(body, res) {
  const { input_url, start_sec, duration_sec } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')
  if (!isFinite(start_sec) || start_sec < 0) return jsonError(res, 400, 'start_sec must be a non-negative number')
  if (!isFinite(duration_sec) || duration_sec <= 0) return jsonError(res, 400, 'duration_sec must be positive')

  // Hard cap on slice duration to prevent runaway encodes.
  const maxDur = 600
  const clipped = Math.min(maxDur, duration_sec)

  const { dir, file: inputFile } = await downloadToTmp(input_url, 'audio-seg-in')
  const outFile = join(dir, 'segment.mp3')

  try {
    // -ss before -i for a fast seek; libmp3lame for broad compatibility
    // with browser audio players. -vn drops any video stream.
    await runFfmpeg(
      [
        '-y',
        '-ss', String(start_sec),
        '-i', inputFile,
        '-t',  String(clipped),
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        outFile,
      ],
      outFile,
    )
    streamFile(res, outFile, 'audio/mpeg')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, `ffmpeg /extract-audio-segment failed: ${String(err?.message || err).slice(0, 1500)}`)
  }
}

// ── endpoint: /extract-video-segment ───────────────────────────────
// Slices the vlog's video + audio between start_sec and (start_sec +
// duration_sec) into an MP4, streamed back to the caller. Used by
// the production engine to materialize a "clip" production — the raw
// moment from the parent vlog with both video and audio tracks intact.
// No captions, no overlays, no re-encoding when the source is already
// H.264/AAC (stream copy).
async function extractVideoSegment(body, res) {
  const { input_url, start_sec, duration_sec } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')
  if (!isFinite(start_sec) || start_sec < 0) return jsonError(res, 400, 'start_sec must be a non-negative number')
  if (!isFinite(duration_sec) || duration_sec <= 0) return jsonError(res, 400, 'duration_sec must be positive')

  // Hard cap — clips longer than 10 minutes don't make sense as a
  // production artifact and would blow up R2 transfer time.
  const maxDur = 600
  const clipped = Math.min(maxDur, duration_sec)

  const { dir, file: inputFile } = await downloadToTmp(input_url, 'video-seg-in')
  const outFile = join(dir, 'segment.mp4')

  try {
    // Two-pass strategy:
    //   1. Try stream copy (no re-encode) — fast, lossless, works when
    //      the source is already H.264/AAC. -ss before -i for fast seek.
    //   2. Fall back to re-encode if stream copy produces a broken file
    //      (some sources need re-encode for clean keyframe seek).
    try {
      await runFfmpeg(
        [
          '-y',
          '-ss', String(start_sec),
          '-i', inputFile,
          '-t',  String(clipped),
          '-c',  'copy',
          '-movflags', '+faststart',
          outFile,
        ],
        outFile,
      )
    } catch (copyErr) {
      // Stream copy failed — try a clean re-encode.
      await runFfmpeg(
        [
          '-y',
          '-ss', String(start_sec),
          '-i', inputFile,
          '-t',  String(clipped),
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          outFile,
        ],
        outFile,
      )
    }
    streamFile(res, outFile, 'video/mp4')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, `ffmpeg /extract-video-segment failed: ${String(err?.message || err).slice(0, 1500)}`)
  }
}

// ── endpoint: /concat-audio ─────────────────────────────────────────
// Stitches N audio inputs (webm/mp4/mp3) into one MP3, in order.
// Used by the production engine to assemble per-beat voiceover takes
// into a single voiceover track.
// Input: { input_urls: string[] }
// Output: MP3 audio stream.
async function concatAudio(body, res) {
  const { input_urls } = body
  if (!Array.isArray(input_urls) || input_urls.length === 0) {
    return jsonError(res, 400, 'input_urls (non-empty array) required')
  }
  if (input_urls.length > 50) {
    return jsonError(res, 400, 'Too many inputs (cap 50)')
  }

  const { join } = await import('path')
  const { writeFileSync } = await import('fs')
  const { dir } = await downloadToTmp(input_urls[0], 'concat-tmp')  // creates dir
  const inputs = []
  try {
    // Download each input to tmp
    for (let i = 0; i < input_urls.length; i++) {
      const inputFile = join(dir, `in-${String(i).padStart(3, '0')}`)
      const resp = await fetch(input_urls[i])
      if (!resp.ok) throw new Error(`input ${i} fetch ${resp.status}`)
      const buf = Buffer.from(await resp.arrayBuffer())
      writeFileSync(inputFile, buf)
      inputs.push(inputFile)
    }

    // ffmpeg concat demuxer needs a manifest file listing inputs.
    const manifestFile = join(dir, 'manifest.txt')
    writeFileSync(
      manifestFile,
      inputs.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    )
    const outFile = join(dir, 'voiceover.mp3')

    // Two-pass: try concat demuxer + re-encode to mp3 (safe across
    // mixed input codecs). -ar 44100 / -ac 2 for portability.
    await runFfmpeg(
      [
        '-y',
        '-f', 'concat', '-safe', '0',
        '-i', manifestFile,
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '160k',
        '-ar', '44100',
        '-ac', '2',
        outFile,
      ],
      outFile,
    )
    streamFile(res, outFile, 'audio/mpeg')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, `ffmpeg /concat-audio failed: ${String(err?.message || err).slice(0, 1500)}`)
  }
}

// ── endpoint: /render-video-essay ───────────────────────────────────
// Combine a voiceover MP3 with N b-roll video clips to produce a
// final MP4. The voiceover audio replaces any audio in the b-roll;
// b-roll videos concatenate in order; output trims to voiceover
// duration (-shortest). If the b-roll is shorter than the voiceover,
// the last frame freezes for the remainder (handled via tpad on the
// final clip's filter chain — simpler approach: just trim; operator
// picks enough b-roll).
//
// Input:
//   { voiceover_url: string, broll_urls: string[] }
// Output:
//   MP4 stream
async function renderVideoEssay(body, res) {
  const { voiceover_url, broll_urls, aspect } = body
  if (!voiceover_url) return jsonError(res, 400, 'voiceover_url required')
  if (!Array.isArray(broll_urls) || broll_urls.length === 0) {
    return jsonError(res, 400, 'broll_urls (non-empty array) required')
  }
  if (broll_urls.length > 30) return jsonError(res, 400, 'Too many broll clips (cap 30)')
  // 9:16 vertical for shorts, 16:9 horizontal for everything else.
  const outW = aspect === '9:16' ? 1080 : 1920
  const outH = aspect === '9:16' ? 1920 : 1080

  const { join } = await import('path')
  const { writeFileSync } = await import('fs')
  const { dir } = await downloadToTmp(voiceover_url, 'render-tmp')

  try {
    // Download voiceover
    const voFile = join(dir, 'voiceover.mp3')
    const voResp = await fetch(voiceover_url)
    if (!voResp.ok) throw new Error(`voiceover fetch ${voResp.status}`)
    writeFileSync(voFile, Buffer.from(await voResp.arrayBuffer()))

    // Download b-roll
    const brollFiles = []
    for (let i = 0; i < broll_urls.length; i++) {
      const f = join(dir, `broll-${String(i).padStart(3, '0')}.mp4`)
      const r = await fetch(broll_urls[i])
      if (!r.ok) throw new Error(`broll ${i} fetch ${r.status}`)
      writeFileSync(f, Buffer.from(await r.arrayBuffer()))
      brollFiles.push(f)
    }

    const outFile = join(dir, 'final.mp4')

    // Build the FFmpeg invocation. We need to concat N video streams
    // (dropping their audio) and pair with the voiceover audio,
    // trimming to whichever ends first.
    // Note: scaling to a common 1920x1080 size keeps concat happy
    // when sources have mixed resolutions.
    const inputArgs = []
    for (const f of brollFiles) {
      inputArgs.push('-i', f)
    }
    inputArgs.push('-i', voFile)

    const N = brollFiles.length
    // Per-input scale + setsar to normalize before concat:
    //   [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,
    //        pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
    const scaleChains = []
    for (let i = 0; i < N; i++) {
      scaleChains.push(
        `[${i}:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,` +
        `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30[v${i}]`,
      )
    }
    const concatInputs = Array.from({ length: N }, (_, i) => `[v${i}]`).join('')
    const filterComplex =
      scaleChains.join(';') + ';' +
      `${concatInputs}concat=n=${N}:v=1:a=0[vout]`

    await runFfmpeg(
      [
        '-y',
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', `${N}:a`,
        '-shortest',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-ar', '44100',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outFile,
      ],
      outFile,
    )
    streamFile(res, outFile, 'video/mp4')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, `ffmpeg /render-video-essay failed: ${String(err?.message || err).slice(0, 1500)}`)
  }
}

// ── endpoint: /ken-burns ───────────────────────────────────────────────
// Turn a single still image into a video clip with a slow zoom + pan
// (Ken Burns effect). Used as the b-roll fallback when Wan 2.7 errors —
// keeps the essay shippable even when image-to-video isn't reachable.
// Input:  { image_url: string, duration_sec: number, width?, height? }
// Output: MP4 video stream.
async function kenBurns(body, res) {
  const { image_url, duration_sec } = body
  const width = body.width || 1280
  const height = body.height || 720
  if (!image_url || typeof image_url !== 'string') {
    return jsonError(res, 400, 'image_url required')
  }
  const dur = Math.max(1, Math.min(30, Number(duration_sec) || 6))
  const { join } = await import('path')
  const { dir, file: inputFile } = await downloadToTmp(image_url, 'kenburns')
  const outFile = join(dir, 'out.mp4')
  try {
    const fps = 30
    const totalFrames = Math.round(dur * fps)
    // Slow zoom from 1.0 → 1.12 with a tiny rightward pan. Scale source to a
    // big intermediate so zoompan has resolution headroom, then downscale.
    const filter = [
      `scale=${width * 2}:${height * 2}:flags=lanczos`,
      `zoompan=z='min(zoom+0.0008,1.12)':d=${totalFrames}:x='iw/2-(iw/zoom/2)+(on*0.2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`,
      `format=yuv420p`,
    ].join(',')
    await runFfmpeg(
      [
        '-y',
        '-loop', '1',
        '-i', inputFile,
        '-vf', filter,
        '-t', String(dur),
        '-r', String(fps),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-an',
        outFile,
      ],
      outFile,
    )
    streamFile(res, outFile, 'video/mp4')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, `ffmpeg /ken-burns failed: ${String(err?.message || err).slice(0, 1500)}`)
  }
}

const routes = {
  '/transcode-h264': transcodeH264,
  '/extract-thumb':  extractThumb,
  '/extract-thumb-mini-transcode': extractThumbMiniTranscode,
  '/extract-audio':  extractAudio,
  '/extract-audio-segment': extractAudioSegment,
  '/extract-video-segment': extractVideoSegment,
  '/concat-audio': concatAudio,
  '/render-video-essay': renderVideoEssay,
  '/ken-burns': kenBurns,
  '/trim':           trim,
  '/concat':         concat,
}

// Build identifier — bumped manually whenever the container code changes.
// /health returns this so the operator can verify which version is live.
// If you push a workers/ffmpeg change and /health still shows the old build,
// deploy-workers.yml didn't actually deploy.
const BUILD_VERSION = 'rebuild-2026-05-18-brace-fix-boot-guards'

const SERVER_BOOT_AT = Date.now()

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, build: BUILD_VERSION }))
    return
  }
  if (req.method === 'GET' && req.url === '/boot-info') {
    // Upstream calls this to confirm the container's process is actually
    // alive (not just the image deployed). Returns enough fingerprint info
    // that we can correlate a deploy with what's running.
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      build: BUILD_VERSION,
      pid: process.pid,
      uptime_ms: Date.now() - SERVER_BOOT_AT,
      node: process.version,
      arch: process.arch,
      platform: process.platform,
    }))
    return
  }
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'POST only (or GET /health)')
  }
  const handler = routes[req.url]
  if (!handler) return jsonError(res, 404, `unknown endpoint: ${req.url}`)
  try {
    const body = await readJsonBody(req)
    await handler(body, res)
  } catch (err) {
    if (!res.headersSent) jsonError(res, 500, err.message || 'internal error')
  }
})

server.listen(PORT, () => {
  console.log(`[neolog-ffmpeg] listening on ${PORT}`)
})
