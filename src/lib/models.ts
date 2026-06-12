/**
 * Model routing — the single inference abstraction.
 *
 * Per CANOPTICON spec Part 16 (model strategy): Llama 3.3 70B is retired as
 * the default. On Cloudflare Workers AI's neuron billing, stronger open
 * models cost the same or less — so within the cheap tier we optimize for
 * QUALITY, not cost. gpt-oss-120b (with adjustable reasoning effort) is the
 * pick for hard-reasoning tasks: the librarian's concept-naming and the
 * video-essay/post script generation. Reasoning effort is a DIAL — high for
 * hard synthesis, low/none for bulk extraction.
 *
 * Everything routes through callReasoning() so a single stage can later be
 * pointed at a different model (or a paid frontier API) by changing one
 * constant — no rearchitecting.
 *
 * SAFETY: the live Workers AI catalog churns and model IDs change on short
 * notice. callReasoning tries the strong model, and on ANY error or empty
 * response falls back to Llama 70B so the feature never hard-breaks. The
 * return value reports which model actually answered (`model`, `fellBack`)
 * so callers can surface it for debugging.
 */

export const MODELS = {
  // Hard reasoning — librarian naming, script/voice synthesis.
  HARD: '@cf/openai/gpt-oss-120b',
  // Cheaper strong model — bulk extraction (not yet wired here; reserved).
  BULK: '@cf/openai/gpt-oss-20b',
  // Fallback when the strong model errors or the catalog moved.
  FALLBACK: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  // Image generation for AI b-roll. Flux Schnell is the verified shape on
  // Workers AI: { prompt, seed, steps:1..8 } → response.image is base64 JPEG.
  IMAGE: '@cf/black-forest-labs/flux-1-schnell',
  // Image-to-video for animated b-roll. The Workers AI catalog hosts Wan 2.7
  // (Alibaba) as the image-to-video model; exact id may churn so the caller
  // also has a Ken-Burns FFmpeg fallback if the AI call fails.
  IMAGE_TO_VIDEO: '@cf/alibaba/wan-2.7',
  // Direct text-to-video with native synchronized audio (dialogue, SFX,
  // ambient). 1-15s per generation, 720p, all aspect ratios. Audio is
  // ALWAYS on — shape it by mentioning sound in the prompt
  // ("with ambient city noise", "soft piano underneath").
  TEXT_TO_VIDEO_AUDIO: '@cf/xai/grok-imagine-video',
  // Text-to-speech with voice cloning. MiniMax 2.8 Turbo clones from a
  // 5-10s reference clip — operator records themselves once, then every
  // beat synthesizes in their voice. 40+ languages, inline interjection
  // tags ((laughs), (sighs), (breath), etc.).
  TTS_CLONE: '@cf/minimax/speech-2.8-turbo',
  // Preset-voice TTS fallback. Deepgram Aura-2 — 40+ voices, natural
  // context-aware pacing. Used when cloning fails or the operator picks
  // a preset voice instead.
  TTS_PRESET: '@cf/deepgram/aura-2-en',
} as const

export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface ReasoningEnv {
  AI: { run: (model: string, args: unknown) => Promise<any> }
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
