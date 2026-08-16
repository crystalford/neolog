/**
 * Auto-suggest cuts — phase 2 of the whole-vlog click-to-cut editor
 * (VlogTranscriptEditor / vlogs.cut_ranges_json). One gpt-oss pass reads
 * the raw transcript and proposes spans to cut — tangents, repeats, dead
 * filler — as VERBATIM quoted text, never as word indices (an LLM can't
 * reliably count word positions in a multi-thousand-word transcript, but
 * it can copy text). The server then locates each quote's real word-index
 * span by exact-match search against transcript_words and silently drops
 * any suggestion that doesn't match — same fail-closed posture as the
 * codebase's voice-preservation grounding checks elsewhere
 * (src/lib/validator.ts): a suggestion that can't be verbatim-verified
 * never reaches the operator.
 *
 * This is a selection task over the operator's own already-said words,
 * not a generator that composes new prose in their voice — same
 * category as the clip-quality judge (src/lib/clip-judge.ts), which
 * likewise doesn't inject voice-shape/operator-profile. Nothing here
 * writes new content; it only proposes what to remove, and the operator
 * reviews every suggestion (rendered as ordinary struck-through cuts they
 * can click to undo) before Save draft / Render ever persists anything.
 */

import { callReasoning } from './models'

interface Word { word: string; start_time: number; end_time: number }

export interface SuggestedCut {
  start_word_index: number
  end_word_index: number
  reason: string
}

interface SuggestEnv {
  AI: { run: (...args: any[]) => Promise<any> } | any
}

const MAX_TRANSCRIPT_CHARS = 20000

const SYSTEM_PROMPT = `You are editing a RAW, unscripted personal vlog transcript down into a tighter, more coherent statement — by identifying spans to CUT, not by rewriting anything.

This is the operator's own voice: hesitations, profanity, fragments, and rough phrasing are NOT reasons to cut. Only propose a cut for one of these:
1. TANGENT — a detour that leaves the current topic and never meaningfully returns to it.
2. REPEAT — the same point stated again, close to verbatim, adding nothing new.
3. FILLER — a genuinely long stretch of pure verbal padding (repeated "um", "like", "you know" with no content), not a single hesitation.

Never propose cutting the substantive core of what the operator is saying, even if it's messy or profane. When in doubt, don't cut it. Prefer FEWER, high-confidence cuts over many marginal ones — a handful of real cuts beats a transcript full of holes.

For each cut, output the EXACT VERBATIM text of the span — copy it character-for-character from the transcript. Do not paraphrase, fix grammar, or trim leading/trailing words. A quote that doesn't match the source exactly will be discarded, so precision matters more than coverage.

Output ONE JSON object, no markdown, no commentary:
{"cuts":[{"quote":"<verbatim text to cut>","reason":"tangent|repeat|filler"}]}
If nothing should be cut, output {"cuts":[]}.`

function normalizeToken(w: string): string {
  return w.toLowerCase().replace(/[^\w']/g, '')
}

/**
 * Exact-match search for a quoted span's word-index range within the
 * vlog's word list. Both sides are normalized identically (lowercase,
 * punctuation stripped) so trailing commas/periods attached to a word
 * token don't cause false misses. Returns null — never a guess — if no
 * exact token sequence match exists.
 */
function findWordSpan(words: Word[], quote: string): { start: number; end: number } | null {
  const quoteTokens = quote.trim().split(/\s+/).map(normalizeToken).filter(Boolean)
  if (quoteTokens.length === 0) return null
  const wordTokens = words.map(w => normalizeToken(w.word))
  outer: for (let i = 0; i <= wordTokens.length - quoteTokens.length; i++) {
    for (let j = 0; j < quoteTokens.length; j++) {
      if (wordTokens[i + j] !== quoteTokens[j]) continue outer
    }
    return { start: i, end: i + quoteTokens.length - 1 }
  }
  return null
}

function parseCutsResponse(raw: string): Array<{ quote: string; reason: string }> {
  if (!raw) return []
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let obj: any
  try { obj = JSON.parse(cleaned.slice(start, end + 1)) } catch { return [] }
  const cuts = Array.isArray(obj?.cuts) ? obj.cuts : []
  return cuts
    .map((c: any) => ({ quote: String(c?.quote ?? '').trim(), reason: String(c?.reason ?? '').trim().slice(0, 40) }))
    .filter((c: any) => c.quote.length > 0)
}

/**
 * Propose cuts for one vlog. Returns only grounded, verbatim-matched
 * suggestions — never persists anything itself, that's the caller's job
 * (and in practice the operator's, via Save draft / Render on the
 * client after reviewing).
 */
export async function suggestCuts(
  env: SuggestEnv,
  args: { transcriptText: string; words: Word[] },
): Promise<{ cuts: SuggestedCut[]; proposed: number; matched: number; model: string; fellBack: boolean }> {
  const { words } = args
  let transcriptText = args.transcriptText
  let truncated = false
  if (transcriptText.length > MAX_TRANSCRIPT_CHARS) {
    transcriptText = transcriptText.slice(0, MAX_TRANSCRIPT_CHARS)
    truncated = true
  }

  const userPrompt = `Transcript${truncated ? ' (truncated to the first portion — only propose cuts within this excerpt)' : ''}:
${transcriptText}

Propose cuts. Output the JSON object only.`

  const out = await callReasoning(env as any, {
    system: SYSTEM_PROMPT,
    user: userPrompt,
    effort: 'medium',
    maxTokens: 3000,
  })

  const proposed = parseCutsResponse(out.text)
  const matches: SuggestedCut[] = []
  for (const p of proposed) {
    const span = findWordSpan(words, p.quote)
    if (!span) continue
    matches.push({ start_word_index: span.start, end_word_index: span.end, reason: p.reason || 'suggested' })
  }

  return { cuts: matches, proposed: proposed.length, matched: matches.length, model: out.model, fellBack: out.fellBack }
}
