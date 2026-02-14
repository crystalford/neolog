/**
 * Audio processing utilities for video upload pipeline.
 * Handles audio extraction from video and chunking for Whisper's 25MB limit.
 */

const WHISPER_MAX_SIZE = 25 * 1024 * 1024 // 25MB

/**
 * Check if a file needs to be chunked for Whisper API.
 */
export function needsChunking(fileSizeBytes: number): boolean {
  return fileSizeBytes > WHISPER_MAX_SIZE
}

/**
 * Split a buffer into chunks suitable for Whisper.
 * For audio files, we split by byte size. Whisper handles partial audio gracefully
 * when using formats like mp3/m4a that have frame boundaries.
 *
 * For best results with large files, the caller should extract audio first
 * using ffmpeg (if available), then chunk the audio.
 */
export function chunkBuffer(
  buffer: Buffer,
  maxChunkSize: number = WHISPER_MAX_SIZE - 1024 * 1024, // 1MB margin
): Buffer[] {
  if (buffer.length <= maxChunkSize) {
    return [buffer]
  }

  const chunks: Buffer[] = []
  let offset = 0

  while (offset < buffer.length) {
    const end = Math.min(offset + maxChunkSize, buffer.length)
    chunks.push(buffer.subarray(offset, end))
    offset = end
  }

  return chunks
}

/**
 * Determine appropriate file extension for a given MIME type.
 */
export function getAudioExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
  }
  return map[mimeType] || 'mp4'
}

/**
 * Check if a MIME type is a video format (vs audio).
 */
export function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

/**
 * Merge multiple Whisper transcription results into one.
 * Adjusts timestamps for chunks based on estimated duration per chunk.
 */
export function mergeTranscriptions(
  results: Array<{
    text: string
    segments?: Array<{ start: number; end: number; text: string }>
    duration?: number
  }>,
): {
  text: string
  segments: Array<{ start: number; end: number; text: string }>
  totalDuration: number
} {
  let fullText = ''
  const allSegments: Array<{ start: number; end: number; text: string }> = []
  let timeOffset = 0

  for (const result of results) {
    if (fullText.length > 0) {
      fullText += ' '
    }
    fullText += result.text

    if (result.segments) {
      for (const seg of result.segments) {
        allSegments.push({
          start: seg.start + timeOffset,
          end: seg.end + timeOffset,
          text: seg.text,
        })
      }
    }

    timeOffset += result.duration || 0
  }

  return {
    text: fullText.trim(),
    segments: allSegments,
    totalDuration: timeOffset,
  }
}
