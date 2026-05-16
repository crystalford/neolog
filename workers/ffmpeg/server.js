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
}

// ─── endpoint: /extract-audio ────────────────────────────────────────────────
// Pulls audio out as MP3 for transcription. Whisper handles MP3 fine.
async function extractAudio(body, res) {
  const { input_url } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')

  const { dir, file: inputFile } = await downloadToTmp(input_url, 'audio-in')
  const outFile = join(dir, 'audio.mp3')
  try {
    await runFfmpeg([
      '-y',
      '-i', inputFile,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      outFile,
    ], outFile)
    streamFile(res, outFile, 'audio/mpeg')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, err.message)
  }
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

const routes = {
  '/transcode-h264': transcodeH264,
  '/extract-thumb':  extractThumb,
  '/extract-thumb-mini-transcode': extractThumbMiniTranscode,
  '/extract-audio':  extractAudio,
  '/trim':           trim,
  '/concat':         concat,
}

// Build identifier — bumped manually whenever the container code changes.
// /health returns this so the operator can verify which version is live.
// If you push a workers/ffmpeg change and /health still shows the old build,
// deploy-workers.yml didn't actually deploy.
const BUILD_VERSION = 'streaming-stdin-v3-2026-05-16'

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, build: BUILD_VERSION }))
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
