/**
 * Transcription via Cloudflare Workers AI Whisper.
 *
 * Model: @cf/openai/whisper-large-v3-turbo
 * Returns word-level timestamps suitable for the transcript_words table —
 * which is the whole reason this path matters, because a recording with no
 * word timings is never read onto the log at all.
 *
 * ⚠️ **The call itself belongs to `src/lib/whisper.ts`, not here.** Until
 * 8 Sep this file posted `{ audio: Array.from(bytes) }` directly, which is
 * the shape `whisper.ts` documents as rejected by the model schema: the AI
 * binding base64-encodes an array into a string, and the schema accepts
 * only `array` or `binary` —
 *
 *   5006: ... '/audio', 'string' not in 'array','binary'
 *
 * So the composer's audio note went to the one shape known not to work,
 * while the two Workers went through `runWhisper`, which tries eight JSON
 * shapes and then POSTs the raw bytes to the Workers AI REST endpoint as
 * `binary`. It also remembers the shape that won, so every later call in
 * the isolate goes straight there. `Array.from()` on a multi-megabyte
 * buffer was the second cost — a JS array of several million numbers built
 * inside a Worker to be thrown away.
 *
 * This file now normalizes what `runWhisper` returns and nothing else.
 *
 * Pricing: Workers AI is billed by neurons. Whisper-large-v3-turbo at
 * roughly 10k neurons / minute of audio. Workers Paid plan ($5/mo) includes
 * generous free neurons; beyond that ~$0.05/hr of audio.
 *
 * Usage from a Workflow / Worker:
 *   const result = await transcribeAudio(env, audioBytes)
 */

import { runWhisper } from '@/lib/whisper'

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
  // Only `.run()` is ever used here. Asking for the whole `Ai` surface made
  // this unassignable from callers whose `Ai` global resolves against a
  // different lib context (the DOM `Response` vs the Workers one) — a type
  // error about `gateway()`, on a function that never calls it.
  AI: { run: (model: any, args: any) => Promise<any> }
  // The REST fallback in `runWhisper` needs these. Absent, it still tries
  // every JSON shape first — it just has nothing left when they all fail.
  CLOUDFLARE_ACCOUNT_ID?: string
  CF_AI_TOKEN?: string
  CLOUDFLARE_API_TOKEN?: string
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

  // One implementation of the call, and it is the one that works.
  const response: any = await runWhisper(env, bytes)

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
