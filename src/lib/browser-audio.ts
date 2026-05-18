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

  // AudioContext.decodeAudioData mutates / detaches the input buffer in
  // Chrome. Copy if the caller might still reference it (the typical
  // capture-page case where the File is also being uploaded to R2 — by
  // the time we get here that upload has read the bytes already, but
  // copying is cheap insurance).
  const decodeBuf = arrayBuf.slice(0)

  // Use an AudioContext just for the initial decode. Its sampleRate is
  // hardware-dependent (usually 44.1 or 48 kHz on Windows) — that's fine,
  // we resample per chunk.
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(decodeBuf)
  } finally {
    try { await ctx.close() } catch {}
  }

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
