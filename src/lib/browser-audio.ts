/**
 * Browser-side audio extraction for Whisper transcription.
 *
 * Replaces the server-side FFmpeg audio extract that became unreliable when
 * the Cloudflare Container Worker stopped instantiating. The browser already
 * has the source video in memory (capture page) or can pull it from R2 over
 * HTTPS (backfill); decoding the audio there is free CPU and keeps the
 * pipeline self-sufficient.
 *
 * Output: an array of WAV chunks at 16 kHz mono, sized to fit comfortably
 * under Workers AI Whisper's 25 MB per-request limit. Each chunk carries
 * its start/end seconds so the transcribe step can stitch transcripts with
 * correct word timestamps.
 *
 * Caveats:
 *  - Uses `AudioContext.decodeAudioData` which buffers the entire decoded
 *    PCM in RAM. ≈ 1.3 GB per hour of stereo 48 kHz source. For 1+ hour
 *    vlogs on a 16 GB laptop this is fine; for 4 GB Chromebooks it may OOM.
 *    We document but don't try to chunk the decode itself in V1.
 *  - Falls back to the AudioContext.sampleRate's native rate then resamples
 *    per chunk via OfflineAudioContext. Resampling 60 min once-through is
 *    ~5-15 seconds on a modern CPU.
 *  - HEVC sources: Chrome decodes the AAC audio track even if the video
 *    track requires hardware codec — works because we use a hidden <audio>
 *    element via the same MP4 container.
 */

interface AudioChunk {
  blob: Blob
  startSec: number
  endSec: number
  bytes: number
}

interface ExtractOpts {
  chunkSeconds?: number
  onProgress?: (info: { phase: 'decoding' | 'chunking'; chunkIndex?: number; totalChunks?: number; ratio?: number }) => void
}

const DEFAULT_CHUNK_SECONDS = 120 // 2 min; ≈ 3.84 MB WAV @ 16 kHz mono 16-bit
                                  // → ~5.1 MB base64 in JSON → safely under
                                  // Workers AI Whisper's per-request size limit.
const TARGET_SAMPLE_RATE = 16000

/**
 * Decode a video/audio File or Blob to WAV chunks for Whisper.
 *
 * Throws if the browser can't decode the source. Catch this and fall back
 * to the legacy ffmpeg path if you have one.
 */
export async function extractAudioChunks(
  source: Blob | ArrayBuffer,
  opts: ExtractOpts = {},
): Promise<AudioChunk[]> {
  const chunkSeconds = opts.chunkSeconds ?? DEFAULT_CHUNK_SECONDS
  const onProgress = opts.onProgress ?? (() => {})

  onProgress({ phase: 'decoding' })

  const arrayBuf = source instanceof ArrayBuffer
    ? source
    : await source.arrayBuffer()

  // Use an AudioContext just for the initial decode. Its sampleRate is
  // hardware-dependent (usually 44.1 or 48 kHz on Windows) — that's fine,
  // we resample per chunk.
  //
  // Note: decodeAudioData mutates / detaches the input buffer in Chrome.
  // We don't copy here because (a) the caller doesn't reference it after
  // this call in any current code path, and (b) for large videos (1 GB+)
  // the copy was a peak-memory killer that caused the whole extract to
  // silently fail in the catch block at the call site.
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(arrayBuf)
  } catch (err: any) {
    try { await ctx.close() } catch {}
    throw new Error(
      `decodeAudioData failed (${(arrayBuf.byteLength / 1_000_000).toFixed(0)} MB input): ` +
      `${err?.message || err}. ` +
      `Likely cause: file is too large for the browser to decode in one pass, ` +
      `or the audio codec isn't supported. Try a shorter clip.`,
    )
  }
  try { await ctx.close() } catch {}

  const sourceDuration = decoded.duration
  const totalChunks = Math.max(1, Math.ceil(sourceDuration / chunkSeconds))
  const chunks: AudioChunk[] = []

  for (let i = 0; i < totalChunks; i++) {
    const startSec = i * chunkSeconds
    const endSec = Math.min(sourceDuration, startSec + chunkSeconds)
    onProgress({ phase: 'chunking', chunkIndex: i, totalChunks, ratio: i / totalChunks })

    const monoBuffer = await renderChunkMono16k(decoded, startSec, endSec)
    const wav = audioBufferToWav(monoBuffer)
    chunks.push({
      blob: new Blob([wav], { type: 'audio/wav' }),
      startSec,
      endSec,
      bytes: wav.byteLength,
    })
  }

  onProgress({ phase: 'chunking', chunkIndex: totalChunks, totalChunks, ratio: 1 })
  return chunks
}

/**
 * Slice the decoded AudioBuffer to [startSec, endSec], down-mix to mono,
 * and resample to TARGET_SAMPLE_RATE via OfflineAudioContext.
 */
async function renderChunkMono16k(
  source: AudioBuffer,
  startSec: number,
  endSec: number,
): Promise<AudioBuffer> {
  const sliceFrames = Math.round((endSec - startSec) * source.sampleRate)
  const outputFrames = Math.round((endSec - startSec) * TARGET_SAMPLE_RATE)
  // Build a temp mono buffer at the source rate by averaging channels.
  const temp = new AudioBuffer({
    length: sliceFrames,
    numberOfChannels: 1,
    sampleRate: source.sampleRate,
  })
  const tempData = temp.getChannelData(0)
  const sliceStart = Math.round(startSec * source.sampleRate)
  const numCh = source.numberOfChannels
  for (let ch = 0; ch < numCh; ch++) {
    const chData = source.getChannelData(ch)
    for (let i = 0; i < sliceFrames; i++) {
      tempData[i] += (chData[sliceStart + i] ?? 0) / numCh
    }
  }

  // Resample via OfflineAudioContext at 16 kHz.
  const offline = new OfflineAudioContext(1, outputFrames, TARGET_SAMPLE_RATE)
  const node = offline.createBufferSource()
  node.buffer = temp
  node.connect(offline.destination)
  node.start(0)
  return offline.startRendering()
}

/**
 * Encode a single-channel AudioBuffer as a 16-bit PCM WAV file.
 * RIFF header + fmt chunk + data chunk. No metadata. Standard PCM that
 * Whisper accepts directly.
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = buffer.length * blockAlign
  const headerSize = 44
  const out = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(out)

  // RIFF chunk descriptor
  writeStr(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(view, 8, 'WAVE')
  // fmt subchunk
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)          // Subchunk1Size = 16 (PCM)
  view.setUint16(20, 1, true)           // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  // data subchunk
  writeStr(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // PCM samples (interleaved if stereo, but we always emit mono here)
  let offset = headerSize
  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return out
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

/**
 * Upload one chunk to a presigned R2 PUT URL. Caller fetches the URL via
 * /api/v2/upload/audio-chunk-presign. Retries 3x with backoff.
 */
export async function uploadChunkToR2(presignedUrl: string, blob: Blob): Promise<void> {
  let lastErr: any
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 120_000)
      try {
        const r = await fetch(presignedUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': 'audio/wav' },
          signal: ctrl.signal,
        })
        if (!r.ok) throw new Error(`R2 PUT ${r.status}`)
        return
      } finally {
        clearTimeout(t)
      }
    } catch (err: any) {
      lastErr = err
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * attempt * 1000))
    }
  }
  throw lastErr || new Error('uploadChunkToR2 exhausted retries')
}

export type { AudioChunk, ExtractOpts }

/**
 * Streaming audio extractor — for files too large to load via
 * `Blob.arrayBuffer()` (Chrome NotReadableErrors at ~2 GB+, and even
 * smaller files can fail if the OS-level file handle gets contended
 * after the thumbnail capture or the Web Audio decode step).
 *
 * Pipes the source through a hidden <video> element + AudioContext +
 * ScriptProcessor so we never need the whole file in memory at once.
 * Trade-off: runs in REAL TIME — a 30-minute vlog extracts in 30
 * minutes. Show progress.
 *
 * Output matches `extractAudioChunks`: WAV chunks at 16 kHz mono,
 * sized to fit under Whisper's per-request limit. Each carries
 * start/end seconds so the transcribe step stitches word timestamps
 * correctly.
 */
export async function extractAudioStreaming(
  file: File | Blob,
  opts: ExtractOpts = {},
): Promise<AudioChunk[]> {
  const chunkSeconds = opts.chunkSeconds ?? DEFAULT_CHUNK_SECONDS
  const onProgress = opts.onProgress ?? (() => {})

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.style.position = 'absolute'
  video.style.left = '-99999px'
  video.style.width = '1px'
  video.style.height = '1px'
  video.muted = false
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  document.body.appendChild(video)

  const cleanup = () => {
    try { video.pause() } catch {}
    try { video.remove() } catch {}
    try { URL.revokeObjectURL(url) } catch {}
  }

  try {
    await new Promise<void>((res, rej) => {
      const onMeta = () => { video.removeEventListener('error', onErr); res() }
      const onErr = () => { video.removeEventListener('loadedmetadata', onMeta); rej(new Error('media load failed (codec or permission)')) }
      video.addEventListener('loadedmetadata', onMeta, { once: true })
      video.addEventListener('error', onErr, { once: true })
    })
    const duration = video.duration
    if (!isFinite(duration) || duration <= 0) {
      throw new Error(`source duration unreadable (${duration})`)
    }

    const ACtor = (window.AudioContext || (window as any).webkitAudioContext)
    const ctx: AudioContext = new ACtor()
    if (ctx.state === 'suspended') {
      try { await ctx.resume() } catch {}
    }
    const sourceNode = ctx.createMediaElementSource(video)
    // ScriptProcessor is deprecated but ubiquitous + simpler than
    // AudioWorklet for a one-off recorder. 4096-sample buffers @ ~48 kHz
    // ≈ 85 ms latency — plenty for chunking.
    const BUFFER_SIZE = 4096
    const processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 1)
    const sampleRate = ctx.sampleRate
    const chunkFrames = Math.round(chunkSeconds * sampleRate)
    const chunks: AudioChunk[] = []
    let buffer = new Float32Array(chunkFrames)
    let bufferFill = 0
    let totalFramesCaptured = 0
    let chunkIndex = 0

    const flushChunk = async (endOfStream: boolean) => {
      const frames = bufferFill
      if (frames === 0) return
      const slice = buffer.subarray(0, frames)
      const tempBuf = new AudioBuffer({
        length: frames, numberOfChannels: 1, sampleRate,
      })
      tempBuf.getChannelData(0).set(slice)
      const outFrames = Math.round((frames / sampleRate) * TARGET_SAMPLE_RATE)
      const offline = new OfflineAudioContext(1, Math.max(1, outFrames), TARGET_SAMPLE_RATE)
      const node = offline.createBufferSource()
      node.buffer = tempBuf
      node.connect(offline.destination)
      node.start(0)
      const resampled = await offline.startRendering()
      const wav = audioBufferToWav(resampled)
      const startSec = chunkIndex * chunkSeconds
      const endSec = startSec + (frames / sampleRate)
      chunks.push({
        blob: new Blob([wav], { type: 'audio/wav' }),
        startSec, endSec, bytes: wav.byteLength,
      })
      chunkIndex++
      bufferFill = 0
      buffer = new Float32Array(chunkFrames)
      onProgress({
        phase: 'chunking',
        chunkIndex,
        totalChunks: Math.max(chunkIndex, Math.ceil(duration / chunkSeconds)),
        ratio: Math.min(1, endSec / duration),
      })
    }

    let pendingFlush: Promise<void> = Promise.resolve()
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer
      const leftCh = input.getChannelData(0)
      const rightCh = input.numberOfChannels > 1 ? input.getChannelData(1) : leftCh
      for (let i = 0; i < input.length; i++) {
        const sample = (leftCh[i] + rightCh[i]) * 0.5
        if (bufferFill < buffer.length) {
          buffer[bufferFill++] = sample
        }
      }
      totalFramesCaptured += input.length
      if (bufferFill >= chunkFrames) {
        // Serialize flushes so we never overlap WAV encoders.
        pendingFlush = pendingFlush.then(() => flushChunk(false)).catch(() => {})
      }
    }

    sourceNode.connect(processor)
    // ScriptProcessor only fires when connected through to destination.
    // Route it through a gain=0 node so we don't actually output sound.
    const silent = ctx.createGain()
    silent.gain.value = 0
    processor.connect(silent)
    silent.connect(ctx.destination)

    onProgress({ phase: 'decoding' })
    await video.play()

    await new Promise<void>(res => {
      const onEnd = () => { video.removeEventListener('ended', onEnd); res() }
      video.addEventListener('ended', onEnd, { once: true })
    })

    // Drain final partial buffer.
    pendingFlush = pendingFlush.then(() => flushChunk(true)).catch(() => {})
    await pendingFlush

    try { sourceNode.disconnect() } catch {}
    try { processor.disconnect() } catch {}
    try { silent.disconnect() } catch {}
    try { await ctx.close() } catch {}

    onProgress({ phase: 'chunking', chunkIndex: chunks.length, totalChunks: chunks.length, ratio: 1 })
    return chunks
  } finally {
    cleanup()
  }
}
