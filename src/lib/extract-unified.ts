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

// Shape of a singleton AI gate DO binding from workers/pipeline. We
// don't import the real DurableObjectNamespace type here because this
// file is shared between the Pages app and the worker, and Pages
// doesn't carry the Workers DO type globally. The shape we actually
// touch is narrower than DurableObjectNamespace anyway.
interface AIGateBinding {
  idFromName(name: string): unknown
  get(id: unknown): {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>
  }
}

export interface ExtractEnv {
  AI: AiBinding
  ANTHROPIC_API_KEY?: string
  // Optional. When present, extract calls route through a gate to
  // enforce a global concurrency cap on Workers AI. When absent (e.g.
  // the legacy process-upload workflow), we fall back to direct
  // env.AI.run.
  LLAMA_GATE?: AIGateBinding
  // Second gate, points at Kimi K2.6 (separate Workers AI rate-limit
  // pool). Extraction round-robins between Llama and Kimi to double
  // effective throughput. If Llama fails, the call automatically
  // retries on Kimi (cross-model fallback). When KIMI_GATE is absent,
  // we just stick with LLAMA_GATE.
  KIMI_GATE?: AIGateBinding
  // For observability — when set, the gate logs wait/run timings
  // against this vlog/operator in pipeline_events.
  LLAMA_GATE_VLOG_ID?: string
  LLAMA_GATE_OPERATOR_ID?: string
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

  // Safety net for the "silent empty extraction" failure mode: an LLM
  // under rate-limit pressure can return parseable JSON whose arrays
  // are all empty. We learned this the hard way bulk-reprocessing 150
  // vlogs at once — all marked complete, zero data persisted. For any
  // transcript that's actually substantial (>= 500 chars), refuse to
  // accept a zero-item extraction. Throw so the DO/workflow retries
  // with backoff, spreading load over time.
  const itemCount =
    (first.payload.threads?.length ?? 0) +
    (first.payload.clips?.length ?? 0) +
    (first.payload.creative_elements?.length ?? 0) +
    (first.payload.entities?.length ?? 0)
  if (itemCount === 0 && transcript.length >= 500) {
    await progress('llm_validate', {
      state: 'failed', reason: 'empty_extraction',
      model: initialModel, transcript_length: transcript.length,
    })
    throw new Error(
      `extraction produced zero items for a ${transcript.length}-char transcript ` +
      `(model=${initialModel}) — likely upstream LLM degraded under load`,
    )
  }

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

const KIMI_K2_6 = '@cf/moonshotai/kimi-k2.6'

type LlmProvider = 'llama' | 'kimi'

// Round-robin pick: if both gates are bound, alternate by hashing the
// vlog_id. With LLAMA_GATE cap 3 + KIMI_GATE cap 3, we get 6 effective
// in-flight LLM extract slots without touching Anthropic. If only Llama
// is bound (legacy callers), stick with it.
function pickProvider(env: ExtractEnv): LlmProvider {
  if (!env.KIMI_GATE) return 'llama'
  if (!env.LLAMA_GATE) return 'kimi'
  const seed = env.LLAMA_GATE_VLOG_ID || ''
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return (h & 1) === 0 ? 'llama' : 'kimi'
}

const PROVIDER_MODELS: Record<LlmProvider, string> = {
  llama: LLAMA_70B,
  kimi: KIMI_K2_6,
}
const PROVIDER_GATE_NAMES: Record<LlmProvider, string> = {
  llama: 'llama-gate-singleton',
  kimi: 'kimi-gate-singleton',
}

async function callViaGate(
  env: ExtractEnv,
  provider: LlmProvider,
  messages: any[],
): Promise<any> {
  const binding = provider === 'llama' ? env.LLAMA_GATE : env.KIMI_GATE
  if (!binding) {
    // Caller is responsible for picking a bound provider. If we get here,
    // fall back to direct env.AI.run on the right model.
    return env.AI.run(PROVIDER_MODELS[provider], { messages, max_tokens: 4096 } as any)
  }
  const stub = binding.get(binding.idFromName(PROVIDER_GATE_NAMES[provider]))
  let gateRes: Response
  try {
    gateRes = await stub.fetch('https://gate/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        max_tokens: 4096,
        vlog_id: env.LLAMA_GATE_VLOG_ID,
        operator_id: env.LLAMA_GATE_OPERATOR_ID,
      }),
    })
  } catch (err: any) {
    throw new Error(`${provider} gate fetch failed: ${err?.message || err}`)
  }
  let envelope: any
  try { envelope = await gateRes.json() }
  catch (err: any) {
    throw new Error(`${provider} gate returned non-JSON (status=${gateRes.status}): ${err?.message || err}`)
  }
  if (!gateRes.ok || envelope?.ok === false) {
    throw new Error(
      `${provider} gate upstream error (status=${gateRes.status}, wait=${envelope?.wait_ms}ms, run=${envelope?.run_ms}ms): ` +
      `${envelope?.error || 'unknown'}`,
    )
  }
  return envelope.result
}

function validateLLMResponse(provider: LlmProvider, res: any): string {
  if (!res) throw new Error(`${provider} returned null/undefined response`)
  if (res.errors) throw new Error(`${provider} errors: ${JSON.stringify(res.errors).slice(0, 400)}`)
  if (res.success === false) {
    throw new Error(`${provider} success:false ${res.error ? `: ${String(res.error).slice(0, 200)}` : ''}`)
  }
  const text = res?.response ?? res?.text ?? ''
  if (typeof text !== 'string' || text.length < 50) {
    throw new Error(`${provider} returned suspiciously short response (${text?.length ?? 0} chars): ${String(text).slice(0, 120)}`)
  }
  return text
}

// Workers AI extract call with automatic cross-model fallback.
// - Picks an initial provider (round-robin between Llama / Kimi).
// - If that throws (rate-limit / degraded response / network), retries
//   ONCE on the OTHER provider. Different rate-limit pool, so failures
//   on one model usually succeed on the other.
// - Only throws if both providers fail.
//
// This is the in-house alternative to falling back to Sonnet — keeps
// extraction entirely on Workers AI while still recovering from
// transient single-model failures.
async function callLlama70B(env: ExtractEnv, transcript: string, jsonReminder = false): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Transcript:\n\n${transcript}${jsonReminder ? '\n\nReturn ONLY the JSON object — no prose.' : ''}` },
  ]

  const primary = pickProvider(env)
  const secondary: LlmProvider = primary === 'llama' ? 'kimi' : 'llama'

  try {
    const res = await callViaGate(env, primary, messages)
    return validateLLMResponse(primary, res)
  } catch (primaryErr: any) {
    // Only cross-fall-back if the OTHER gate is bound. Otherwise re-throw.
    const otherBinding = secondary === 'llama' ? env.LLAMA_GATE : env.KIMI_GATE
    if (!otherBinding) throw primaryErr
    try {
      const res = await callViaGate(env, secondary, messages)
      return validateLLMResponse(secondary, res)
    } catch (secondaryErr: any) {
      throw new Error(
        `both providers failed: ${primary}: ${primaryErr?.message || primaryErr} | ` +
        `${secondary}: ${secondaryErr?.message || secondaryErr}`,
      )
    }
  }
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
  if (!res?.text || res.text.length < 50) {
    throw new Error(`Sonnet returned suspiciously short response (${res?.text?.length ?? 0} chars)`)
  }
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
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('parsed result is not an object')
  }
  // Detect the "shape-but-no-content" failure mode: model returned a
  // syntactically valid JSON object but every expected array key is
  // missing entirely. This happens when an upstream LLM returns a
  // refusal or a tiny placeholder; treat it as a parse failure so the
  // caller retries.
  const hasAnyArray =
    Array.isArray(parsed.threads) ||
    Array.isArray(parsed.clips) ||
    Array.isArray(parsed.creative_elements) ||
    Array.isArray(parsed.entities)
  if (!hasAnyArray && typeof parsed.summary !== 'string') {
    throw new Error('parsed JSON has no expected keys (threads / clips / creative_elements / entities / summary)')
  }
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 2000) : '',
    threads: Array.isArray(parsed.threads) ? parsed.threads : [],
    clips: Array.isArray(parsed.clips) ? parsed.clips : [],
    creative_elements: Array.isArray(parsed.creative_elements) ? parsed.creative_elements : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
  }
}
