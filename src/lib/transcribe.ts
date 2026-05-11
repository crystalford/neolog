/**
 * Transcription via Cloudflare Workers AI Whisper.
 *
 * Replaces Groq Whisper + Replicate Whisper fallback. Same vendor as the rest
 * of the stack.
 *
 * Model: @cf/openai/whisper-large-v3-turbo
 * Returns word-level timestamps suitable for the transcript_words table.
 *
 * Pricing: Workers AI is billed by neurons. Whisper-large-v3-turbo at
 * roughly 10k neurons / minute of audio. Workers Paid plan ($5/mo) includes
 * generous free neurons; beyond that ~$0.05/hr of audio.
 *
 * Usage from a Workflow / Worker:
 *   const result = await transcribeAudio(env, audioBytes)
 */

import type { Ai } from '@cloudflare/workers-types'

export interface TranscribeWord {
  word: string
  start: number  // seconds
  end: number    // seconds
}

export interface TranscribeResult {
  text: string
  language: string | null
  duration_seconds: number | null
  words: TranscribeWord[]
  segments: { start: number; end: number; text: string }[]
}

export interface TranscribeEnv {
  AI: Ai
}

/**
 * Transcribe a chunk of audio. Caller is responsible for slicing audio
 * if longer than the Workers AI input limit (the wrapper handles chunking
 * via concatenation but does not split a single buffer).
 *
 * Input: the raw audio bytes (mp3/wav/m4a all accepted by Whisper).
 */
export async function transcribeAudio(
  env: TranscribeEnv,
  audioBytes: ArrayBuffer | Uint8Array,
): Promise<TranscribeResult> {
  const bytes = audioBytes instanceof Uint8Array ? audioBytes : new Uint8Array(audioBytes)

  // Workers AI Whisper accepts a Uint8Array directly. The model returns a
  // text field plus optional word/segment arrays.
  const response: any = await env.AI.run(
    '@cf/openai/whisper-large-v3-turbo' as any,
    {
      audio: Array.from(bytes),
      task: 'transcribe',
      // Returns timestamps when available
      // (model behavior varies by version — present at time of writing)
    } as any,
  )

  // Normalize the response into our shape. Workers AI returns different field
  // names across models / versions; we map the common ones.
  const text = response.text ?? response.transcription ?? ''
  const language = response.language ?? null
  const duration_seconds = typeof response.duration === 'number' ? response.duration : null

  const rawWords: any[] = response.words || []
  const words: TranscribeWord[] = rawWords
    .map(w => ({
      word: String(w.word ?? w.text ?? '').trim(),
      start: typeof w.start === 'number' ? w.start : 0,
      end: typeof w.end === 'number' ? w.end : 0,
    }))
    .filter(w => w.word.length > 0)

  const rawSegments: any[] = response.segments || []
  const segments = rawSegments
    .map(s => ({
      start: typeof s.start === 'number' ? s.start : 0,
      end: typeof s.end === 'number' ? s.end : 0,
      text: String(s.text ?? '').trim(),
    }))
    .filter(s => s.text.length > 0)

  return { text, language, duration_seconds, words, segments }
}
