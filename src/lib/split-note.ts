/**
 * Splitting one note into the several things it actually was.
 *
 * `branch.html`: "A two-minute voice note carried a question, a theory, two
 * more theories tangled into it, and a name. The log split them."
 *
 * This is how the operator actually records. His own description of his
 * method: voice-to-text while driving — run-on, self-correcting, several
 * thoughts tangled into one take. A two-minute note that carries four things
 * and lands on the log as one line is four things lost.
 *
 * SPEC §1 puts it above the fence explicitly: "Above the fence — build: say
 * it once, it exists · **the log splits a note and makes what needs making**
 * · looks things up · everything attaches."
 *
 * ── Why this cannot paraphrase, and structurally does not ────────────────
 *
 * Every part must be HIS words, because each part becomes an entry carrying
 * `author='operator'`. So the model is never asked to write anything. It is
 * asked only WHERE the seams are, and it answers with a verbatim anchor —
 * the first few words of each part, copied from the transcript.
 *
 * The anchors are then located in the transcript by exact match, and the
 * parts are slices between them. A part is therefore a substring of what he
 * said, always. An anchor the model invented simply is not found, and that
 * seam is dropped — the failure mode is "fewer splits", never "words he
 * didn't say".
 */

import { callReasoning } from '@/lib/models'

export interface NotePart {
  text: string
  /** Character offset into the transcript, so a part can be timed later. */
  at: number
}

interface SplitEnv { AI: { run: (m: any, a: any) => Promise<any> } }

/** Below this a note is one thought and splitting it invents structure. */
export const MIN_WORDS_TO_SPLIT = 120

const SYSTEM = `You are given a transcript of one person talking to themselves. It usually contains several separate things: a question, a theory, a memory, a decision, a name to remember.

Your only job is to say WHERE one thing ends and the next begins. You never write, rephrase, summarise or title anything.

Return ONE JSON object:
{"parts":[{"starts_with":"<the first 6 to 10 words of this part, copied EXACTLY from the transcript>"}]}

Rules:
- "starts_with" must be copied character-for-character from the transcript. Do not fix grammar, do not remove filler, do not change punctuation or capitalisation. If you cannot copy it exactly, leave that part out.
- The first part starts at the beginning of the transcript.
- Split only where the subject genuinely changes. A person circling back to the same idea is ONE part, not two.
- If the whole transcript is one thing, return one part.
- Never more than 8 parts.`

function firstJsonObject(text: string): any | null {
  const cleaned = (text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

/** Loose match: whitespace and case vary, the words do not. */
function findAnchor(haystack: string, anchor: string, from: number): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ')
  const h = norm(haystack)
  const a = norm(anchor).trim()
  if (a.length < 8) return -1
  const idx = h.indexOf(a, from)
  return idx
}

/**
 * Split a transcript into its parts. Returns one part (the whole thing) when
 * it is one thought, when the model fails, or when nothing it returned could
 * be located — every failure path keeps the note whole rather than
 * fabricating a seam.
 */
export async function splitNote(
  env: SplitEnv,
  transcript: string,
): Promise<NotePart[]> {
  const whole: NotePart[] = [{ text: transcript.trim(), at: 0 }]
  const words = transcript.trim().split(/\s+/).filter(Boolean).length
  if (words < MIN_WORDS_TO_SPLIT) return whole

  let raw = ''
  try {
    const res = await callReasoning(env as any, {
      system: SYSTEM,
      user: transcript.slice(0, 24000),
      effort: 'medium',
      maxTokens: 600,
    })
    raw = res.text || ''
  } catch {
    return whole
  }

  const parsed = firstJsonObject(raw)
  const anchors: string[] = Array.isArray(parsed?.parts)
    ? parsed.parts.map((p: any) => (typeof p?.starts_with === 'string' ? p.starts_with : '')).filter(Boolean)
    : []
  if (anchors.length < 2) return whole

  // Locate each anchor in order. One that cannot be found is not a seam.
  const cuts: number[] = [0]
  let from = 0
  for (const a of anchors.slice(1)) {
    const idx = findAnchor(transcript, a, from + 1)
    if (idx < 0) continue
    cuts.push(idx)
    from = idx
  }
  if (cuts.length < 2) return whole

  const parts: NotePart[] = []
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i]
    const end = i + 1 < cuts.length ? cuts[i + 1] : transcript.length
    const text = transcript.slice(start, end).trim()
    // A sliver is a bad seam, not a thought.
    if (text.split(/\s+/).filter(Boolean).length < 12) continue
    parts.push({ text, at: start })
  }

  return parts.length >= 2 ? parts : whole
}
