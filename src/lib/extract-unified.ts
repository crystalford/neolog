/**
 * Unified extraction — one LLM call returns threads + clips +
 * creative_elements + entities for a single transcript. Replaces the four
 * separate calls in src/lib/extract.ts.
 *
 * Provider routing (operator-configurable; default 'auto'):
 *   'auto'     Workers AI Llama 3.3 70B fp8-fast (cheap). If validator
 *              reports failRate > 0.15, retry on Anthropic Sonnet 4.6
 *              via the same prompt. Sonnet result wins.
 *   'cheap'    Llama 3.3 70B fp8-fast only. No escalation.
 *   'premium'  Sonnet 4.6 only.
 *
 * Caller responsibilities:
 *  - Provide the full transcript_text.
 *  - Pass a `recordEvent` hook so progress (running/ok/escalate) is
 *    visible in the live UI without this lib knowing about WebSockets.
 *  - Persist the returned extraction_runs row + flattened tables.
 *
 * Voice preservation: validator runs on every take/quote/content. Items
 * failing the 4-gram check are still inserted, but with validated=0 so
 * the UI can mark them. failRate drives the auto-escalation decision.
 */

import { callClaude } from './anthropic'
import { buildTranscriptFourGrams, validateGrounded } from './validator'

export type ExtractionMode = 'auto' | 'cheap' | 'premium'

export interface ExtractedThread {
  topic: string
  take: string
  key_quotes: string[]
  register: 'riff' | 'observation' | 'argument' | 'story' | 'aside' | 'question'
  // post-validate
  validated?: 0 | 1
}

export interface ExtractedClip {
  start_time_ms?: number
  end_time_ms?: number
  headline: string
  quote: string
  why_clippable?: string
  validated?: 0 | 1
}

export interface ExtractedCreative {
  element_type: 'character_beat' | 'scene_fragment' | 'dialogue' | 'theme' | 'setting' | 'tonal_reference' | 'plot_fragment'
  content: string
  validated?: 0 | 1
}

export interface ExtractedEntity {
  name: string
  entity_type: 'person' | 'place' | 'project' | 'tool' | 'concept' | 'theme' | 'reference'
  aliases?: string[]
}

export interface ExtractionPayload {
  // 60-120 word plain-English summary of what the vlog is about. Shown at
  // the top of /timeline/[id] so the operator gets a sense of the content
  // without reading the full transcript or threads. Voice-grounded but not
  // 4-gram verified (it's a paraphrase by design).
  summary?: string
  threads: ExtractedThread[]
  clips: ExtractedClip[]
  creative_elements: ExtractedCreative[]
  entities: ExtractedEntity[]
}

export interface ExtractionRun {
  model: 'llama-3.3-70b-fp8-fast' | 'sonnet-4.6'
  escalated_from?: 'llama-3.3-70b-fp8-fast'
  payload: ExtractionPayload
  total_items: number
  invalid_items: number
  fail_rate: number
}

interface AiBinding {
  run: (model: string, input: any, opts?: any) => Promise<any>
}

export interface ExtractEnv {
  AI: AiBinding
  ANTHROPIC_API_KEY?: string
}

const SYSTEM_PROMPT = `You are an extraction engine for vlog transcripts. Output JSON only.

# HARD RULES
1. Every "take", "quote", and "content" field MUST be a verbatim substring
   of the source transcript. Copy the exact words — do not rephrase, summarize,
   or improve the wording.
2. Each verbatim substring must be at least 4 consecutive words from the
   transcript (case- and punctuation-insensitive match only).
3. If you cannot find a verbatim substring that supports a point, OMIT the
   point. It is better to return 3 grounded items than 10 paraphrased ones.
4. Output ONLY the JSON object. No prose before or after.

# SELF-CHECK BEFORE RESPONDING
For every "take" / "quote" / "content":
- Locate the exact phrase in the transcript above.
- If you cannot find it verbatim, replace with the closest exact substring
  or drop the entry.

# OUTPUT SCHEMA
{
  "summary": "<60-120 word plain-English paragraph: what this vlog is about, in the operator's voice. May paraphrase; not subject to the verbatim 4-word rule.>",
  "threads": [
    { "topic": "<short label>",
      "take": "<verbatim 4+ word substring>",
      "key_quotes": ["<verbatim>", ...],
      "register": "riff|observation|argument|story|aside|question" }
  ],
  "clips": [
    { "headline": "<short label>",
      "quote": "<verbatim 4+ word substring>",
      "why_clippable": "<your reasoning, not constrained>" }
  ],
  "creative_elements": [
    { "element_type": "character_beat|scene_fragment|dialogue|theme|setting|tonal_reference|plot_fragment",
      "content": "<verbatim 4+ word substring>" }
  ],
  "entities": [
    { "name": "<entity name as appears>",
      "entity_type": "person|place|project|tool|concept|theme|reference",
      "aliases": ["<as appears>", ...] }
  ]
}`

const LLAMA_70B = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export type ProgressHook = (sub: string, payload: Record<string, unknown>) => Promise<void> | void

/**
 * Run extraction with the given mode. Returns the active run with model
 * provenance + flattened payload + validation stats.
 */
export async function runExtraction(
  env: ExtractEnv,
  transcript: string,
  mode: ExtractionMode,
  progress: ProgressHook = async () => {},
): Promise<ExtractionRun> {
  if (transcript.length < 50) {
    // Soft-skip: don't fail the pipeline. Tiny clips (filler, dead air,
    // a cough) genuinely have nothing to extract — that's a known state,
    // not an error. Caller writes an empty payload + records the skip
    // outcome in pipeline_events so the operator sees "Skipped: transcript
    // too short" instead of a red stack trace.
    await progress('llm_call', {
      state: 'skipped', reason: 'transcript_too_short',
      length: transcript.length, min_length: 50,
    })
    return {
      model: mode === 'premium' ? 'sonnet-4.6' : 'llama-3.3-70b-fp8-fast',
      payload: { summary: '', threads: [], clips: [], creative_elements: [], entities: [] },
      total_items: 0,
      invalid_items: 0,
      fail_rate: 0,
    }
  }
  const fourGrams = buildTranscriptFourGrams(transcript)

  const runOne = async (
    model: 'llama-3.3-70b-fp8-fast' | 'sonnet-4.6',
  ): Promise<{ payload: ExtractionPayload; failRate: number; invalid: number; total: number }> => {
    await progress('llm_call', { state: 'running', model, attempt: 1 })
    const raw = model === 'sonnet-4.6'
      ? await callSonnet(env, transcript)
      : await callLlama70B(env, transcript)

    let parsed: ExtractionPayload
    try {
      parsed = parseExtractionJson(raw)
    } catch (err: any) {
      // One retry with a "return only JSON" reminder.
      await progress('llm_call', { state: 'retrying', model, attempt: 2, reason: err?.message || String(err) })
      const retried = model === 'sonnet-4.6'
        ? await callSonnet(env, transcript, true)
        : await callLlama70B(env, transcript, true)
      parsed = parseExtractionJson(retried)
    }

    // Validate each item type
    const threadCheck = validateGrounded(parsed.threads ?? [], t => [t.take, ...(t.key_quotes ?? [])], fourGrams)
    const clipCheck = validateGrounded(parsed.clips ?? [], c => [c.quote], fourGrams)
    const creativeCheck = validateGrounded(parsed.creative_elements ?? [], e => [e.content], fourGrams)
    // entities are short references, no grounding requirement

    parsed.threads = (parsed.threads ?? []).map((t, i) => ({
      ...t,
      validated: threadCheck.invalidIndices.includes(i) ? 0 : 1,
    }))
    parsed.clips = (parsed.clips ?? []).map((c, i) => ({
      ...c,
      validated: clipCheck.invalidIndices.includes(i) ? 0 : 1,
    }))
    parsed.creative_elements = (parsed.creative_elements ?? []).map((e, i) => ({
      ...e,
      validated: creativeCheck.invalidIndices.includes(i) ? 0 : 1,
    }))

    const total = threadCheck.total + clipCheck.total + creativeCheck.total
    const invalid = threadCheck.invalid + clipCheck.invalid + creativeCheck.invalid
    const failRate = total === 0 ? 0 : invalid / total

    await progress('llm_validate', {
      state: 'ok', model, total, valid: total - invalid, invalid, fail_rate: failRate,
    })
    return { payload: parsed, failRate, invalid, total }
  }

  const initialModel = mode === 'premium' ? 'sonnet-4.6' : 'llama-3.3-70b-fp8-fast'
  const first = await runOne(initialModel)

  // Auto-escalate if cheap pass had too many ungrounded items
  if (mode === 'auto' && first.failRate > 0.15) {
    await progress('llm_escalate', {
      state: 'running',
      reason: `fail_rate ${first.failRate.toFixed(2)} > 0.15 threshold`,
      from: initialModel,
      to: 'sonnet-4.6',
    })
    const second = await runOne('sonnet-4.6')
    return {
      model: 'sonnet-4.6',
      escalated_from: 'llama-3.3-70b-fp8-fast',
      payload: second.payload,
      total_items: second.total,
      invalid_items: second.invalid,
      fail_rate: second.failRate,
    }
  }

  return {
    model: initialModel,
    payload: first.payload,
    total_items: first.total,
    invalid_items: first.invalid,
    fail_rate: first.failRate,
  }
}

async function callLlama70B(env: ExtractEnv, transcript: string, jsonReminder = false): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Transcript:\n\n${transcript}${jsonReminder ? '\n\nReturn ONLY the JSON object — no prose.' : ''}` },
  ]
  const res: any = await env.AI.run(LLAMA_70B, { messages, max_tokens: 4096 } as any)
  return res?.response ?? res?.text ?? ''
}

async function callSonnet(env: ExtractEnv, transcript: string, jsonReminder = false): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — required for sonnet-4.6 extraction')
  }
  const res = await callClaude(
    { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
    {
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Transcript:\n\n${transcript}${jsonReminder ? '\n\nReturn ONLY the JSON object — no prose.' : ''}` },
      ],
    },
  )
  return res.text
}

function parseExtractionJson(raw: string): ExtractionPayload {
  // Strip code fences if the model wrapped output
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  const parsed = JSON.parse(s)
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 2000) : '',
    threads: Array.isArray(parsed.threads) ? parsed.threads : [],
    clips: Array.isArray(parsed.clips) ? parsed.clips : [],
    creative_elements: Array.isArray(parsed.creative_elements) ? parsed.creative_elements : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
  }
}
