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

/**
 * The transcript flattened for matching, and the way back.
 *
 * ⚠️ The way back is the whole point. This used to be one expression —
 * `haystack.toLowerCase().replace(/\s+/g, ' ').indexOf(anchor)` — and the
 * caller sliced the ORIGINAL transcript with the index it returned. Those
 * are two different strings: every run of two or more whitespace characters
 * makes the flattened one shorter, so after the first paragraph break the
 * index pointed somewhere else in the original. A cut landed mid-word, and
 * the part before it kept words the part after it also had.
 *
 * `read-recording.ts` never saw it, because it joins `transcript_words` with
 * single spaces and there is nothing to collapse. The composer's *talk*
 * button hands over a raw Whisper transcript, and those are full of
 * newlines.
 *
 * `map[i]` is the index in the original of the character `flat[i]` came
 * from — one entry per output character, so a `toLowerCase()` that changes
 * length cannot shift it either.
 */
function flatten(s: string): { flat: string; map: number[] } {
  let flat = ''
  const map: number[] = []
  let i = 0
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      const at = i
      while (i < s.length && /\s/.test(s[i])) i++
      flat += ' '
      map.push(at)
      continue
    }
    const lower = s[i].toLowerCase()
    for (const ch of lower) { flat += ch; map.push(i) }
    i++
  }
  return { flat, map }
}

/** An anchor, flattened the same way, so the two can be compared. */
function flattenAnchor(anchor: string): string {
  return anchor.toLowerCase().replace(/\s+/g, ' ').trim()
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

  // Locate each anchor in order. One that cannot be found is not a seam —
  // the failure mode is fewer splits, never words he did not say.
  //
  // The search runs in flattened space and the cut is recorded in the
  // ORIGINAL, through `map`. Both are needed: matching has to survive a
  // newline the model did not reproduce, and slicing has to land on the
  // character the anchor actually starts at.
  const { flat, map } = flatten(transcript)
  const cuts: number[] = [0]
  let fromFlat = 0
  for (const a of anchors.slice(1)) {
    const needle = flattenAnchor(a)
    // Too short to be a seam rather than a coincidence.
    if (needle.length < 8) continue
    const idxFlat = flat.indexOf(needle, fromFlat + 1)
    if (idxFlat < 0) continue
    const idx = map[idxFlat]
    // Monotonic by construction, but a cut that did not advance would make
    // an empty part.
    if (idx <= cuts[cuts.length - 1]) continue
    cuts.push(idx)
    fromFlat = idxFlat
  }
  if (cuts.length < 2) return whole

  // ⚠️ A sliver is a bad seam, not a thought — and it is DROPPED into its
  // neighbour, not dropped. Skipping it lost those words from the log
  // entirely: the whole take survives on the recording, but the entries no
  // longer held everything he said, and nothing on any screen said so. The
  // seam is what the log is allowed to be wrong about; the words are not.
  const MIN_PART_WORDS = 12
  const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length

  // Spans over the ORIGINAL, kept as [start, end) so a merge is arithmetic
  // rather than string surgery on already-trimmed text.
  const spans: { at: number; end: number }[] = []
  for (let i = 0; i < cuts.length; i++) {
    spans.push({ at: cuts[i], end: i + 1 < cuts.length ? cuts[i + 1] : transcript.length })
  }
  // Merge every sliver BACKWARD into the span before it…
  for (let i = spans.length - 1; i > 0; i--) {
    if (wordCount(transcript.slice(spans[i].at, spans[i].end)) < MIN_PART_WORDS) {
      spans[i - 1].end = spans[i].end
      spans.splice(i, 1)
    }
  }
  // …and a short FIRST span forward, since it has nothing before it.
  while (spans.length >= 2
    && wordCount(transcript.slice(spans[0].at, spans[0].end)) < MIN_PART_WORDS) {
    spans[1].at = spans[0].at
    spans.shift()
  }

  const parts: NotePart[] = spans.map(s => ({ text: transcript.slice(s.at, s.end).trim(), at: s.at }))

  return parts.length >= 2 ? parts : whole
}
