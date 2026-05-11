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
 *   POST /transcode-h264   { input_url }                  -> mp4 (H.264 + AAC)
 *   POST /extract-thumb    { input_url, t? }              -> jpg (binary body)
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
import { mkdtempSync, createReadStream, statSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
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
 * Download a URL to a temp file. Returns the temp file path.
 * Throws if the fetch fails or exceeds maxBytes (defaults to 4 GB).
 */
async function downloadToTmp(url, label, maxBytes = 4 * 1024 * 1024 * 1024) {
  const tmp = mkdtempSync(join(tmpdir(), `neolog-ffmpeg-${label}-`))
  const tmpFile = join(tmp, 'input')
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Fetch ${label} failed: HTTP ${resp.status}`)
  const len = parseInt(resp.headers.get('content-length') || '0', 10)
  if (len && len > maxBytes) throw new Error(`Input too large: ${len} > ${maxBytes}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  await writeFile(tmpFile, buf)
  return { dir: tmp, file: tmpFile }
}

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
// Extracts a single JPEG frame at time t (seconds). Default t=1.0 to skip
// black opening frames common in phone-shot video. Returns raw JPEG binary;
// the main Worker base64-encodes for the data: URL stored in D1.
async function extractThumb(body, res) {
  const { input_url, t } = body
  if (!input_url) return jsonError(res, 400, 'input_url required')
  const seekTime = typeof t === 'number' && t >= 0 ? t : 1.0

  const { dir, file: inputFile } = await downloadToTmp(input_url, 'thumb-in')
  const outFile = join(dir, 'frame.jpg')
  try {
    await runFfmpeg([
      '-y',
      '-ss', String(seekTime),     // seek BEFORE -i for speed
      '-i', inputFile,
      '-frames:v', '1',
      '-vf', 'scale=320:-2',       // 320 wide, aspect preserved
      '-q:v', '4',                 // ~JPEG quality 0.82-ish
      outFile,
    ], outFile)
    streamFile(res, outFile, 'image/jpeg')
    res.on('close', () => cleanup(dir))
  } catch (err) {
    cleanup(dir)
    jsonError(res, 500, err.message)
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
  '/extract-audio':  extractAudio,
  '/trim':           trim,
  '/concat':         concat,
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
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
