/**
 * Model routing.
 *
 * Two models, for two jobs, and that is the whole list.
 *
 * `callReasoning` is the ONE place in this product a model writes prose,
 * and it has exactly two callers: the answer on `/search` and a month's
 * paragraph on `/month/[ym]`. Both check every sentence's citations in code
 * before showing it and drop the ones that fail — the model's output is
 * never trusted, only its ability to point at passages that exist.
 *
 * `VISION` has one job: looking at an uploaded image and saying whether it
 * is the kind of document that must never be published (SPEC §0.2), plus
 * reading the words out of a picture that is really text. It is asked what
 * it SEES, never what something means.
 *
 * ── What this file used to route ─────────────────────────────────────────
 *
 * Flux for b-roll stills, Wan 2.7 for animating them, Grok Imagine for
 * text-to-video with synchronised audio, MiniMax for cloning the operator's
 * voice, Aura-2 for preset narration, gpt-oss-20b reserved for bulk
 * extraction. All of it went with the video-essay studio on 8 Sep, and none
 * of it is coming back: a generator is what the operator stopped trusting.
 *
 * **Do not add a model to this file without a caller and a reason written
 * next to it.** A model id sitting here unused is an invitation.
 *
 * SAFETY: the live Workers AI catalog churns and model IDs change on short
 * notice, so `callReasoning` tries the strong model and on ANY error or
 * empty response falls back, reporting which one answered.
 */

export const MODELS = {
  // Writing an answer from passages, on /search and /month. The only place
  // a model writes prose, and its output is citation-checked in code.
  HARD: '@cf/openai/gpt-oss-120b',
  // Fallback when the strong model errors or the catalog moved.
  FALLBACK: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  // Vision. Llama 4 Scout is natively multimodal. Used for exactly two
  // jobs, both of which are "what is visibly on this image": the hold-back
  // check, and reading the words out of a screenshot.
  VISION: '@cf/meta/llama-4-scout-17b-16e-instruct',
} as const

export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface ReasoningEnv {
  AI: { run: (model: any, args: unknown) => Promise<any> }
}

export interface ReasoningResult {
  text: string
  model: string
  fellBack: boolean
}

/**
 * Call the hard-reasoning model with an effort dial; fall back to Llama 70B
 * if it errors or returns empty. Returns the text + which model produced it.
 */
export async function callReasoning(
  env: ReasoningEnv,
  args: { system: string; user: string; effort?: ReasoningEffort; maxTokens?: number },
): Promise<ReasoningResult> {
  const { system, user, effort = 'medium', maxTokens = 4096 } = args

  // Attempt 1 — the strong model (gpt-oss-120b), via the Responses-API shape
  // Workers AI documents for it: { instructions, input, reasoning:{effort} }.
  try {
    const res = await env.AI.run(MODELS.HARD, {
      instructions: system,
      input: user,
      reasoning: { effort },
      max_tokens: maxTokens,
    })
    const text = extractText(res)
    if (text && text.trim().length > 0) {
      return { text: text.trim(), model: MODELS.HARD, fellBack: false }
    }
    console.warn(`[callReasoning] ${MODELS.HARD} returned empty; falling back`)
  } catch (err: any) {
    console.warn(`[callReasoning] ${MODELS.HARD} failed (${err?.message || err}); falling back to ${MODELS.FALLBACK}`)
  }

  // Attempt 2 — Llama 70B fallback (chat/messages shape, no reasoning param).
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const res2 = await env.AI.run(MODELS.FALLBACK, { messages, max_tokens: maxTokens })
  return { text: extractText(res2).trim(), model: MODELS.FALLBACK, fellBack: true }
}

/**
 * Pull text out of whatever shape Workers AI returned. gpt-oss models can
 * answer via the Responses-API style (`output` array / `output_text`),
 * while Llama answers via `response`, and OpenAI-compat models via
 * `choices[].message.content`. Handle all of them.
 */
export function extractText(res: any): string {
  if (!res) return ''
  if (typeof res.response === 'string') return res.response
  if (typeof res.output_text === 'string') return res.output_text
  if (Array.isArray(res.output)) {
    const parts: string[] = []
    for (const item of res.output) {
      // gpt-oss reasoning models emit reasoning + message items; keep only
      // the assistant message text, skip the reasoning trace.
      if (item?.type === 'reasoning') continue
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === 'string') parts.push(c.text)
          else if (typeof c === 'string') parts.push(c)
        }
      } else if (typeof item?.text === 'string') {
        parts.push(item.text)
      }
    }
    if (parts.length > 0) return parts.join('')
  }
  if (res.choices?.[0]?.message?.content) return String(res.choices[0].message.content)
  return ''
}
