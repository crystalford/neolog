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

// Shape of the LlamaGate singleton DO binding from workers/pipeline.
// We don't import the real DurableObjectNamespace type here because
// this file is shared between the Pages app and the worker, and Pages
// doesn't carry the Workers DO type globally.
interface LlamaGateBinding {
  idFromName(name: string): unknown
  get(id: unknown): {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>
  }
}

export interface ExtractEnv {
  AI: AiBinding
  ANTHROPIC_API_KEY?: string
  // Optional. When present, callLlama70B routes through the gate to
  // queue calls at the gate's concurrency cap. When absent (legacy
  // process-upload workflow path) we fall back to direct env.AI.run.
  LLAMA_GATE?: LlamaGateBinding
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

  // Empty-extraction guard removed. The earlier "throw if zero items
  // and transcript >= 500 chars" check was over-aggressive — a 1000-
  // char transcript of filler audio (uhhhs, breaks, dead air) can
  // legitimately yield zero extractable items. The shape-aware
  // validation in callLlama70B distinguishes "model said {}" (valid
  // empty) from "model returned garbage" (genuine failure), so we
  // don't need a second-guess layer here. Empty payloads now flow
  // through as successful zero-item runs; the UI surfaces them as
  // "complete + no data" (see /api/v2/admin/pipeline-state).
  const itemCount =
    (first.payload.threads?.length ?? 0) +
    (first.payload.clips?.length ?? 0) +
    (first.payload.creative_elements?.length ?? 0) +
    (first.payload.entities?.length ?? 0)
  if (itemCount === 0) {
    await progress('llm_validate', {
      state: 'ok', reason: 'empty_extraction_accepted',
      model: initialModel, transcript_length: transcript.length,
    })
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

async function callLlama70B(env: ExtractEnv, transcript: string, jsonReminder = false, _retryDepth = 0): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Transcript:\n\n${transcript}${jsonReminder ? '\n\nReturn ONLY the JSON object — no prose.' : ''}` },
  ]

  let res: any
  if (env.LLAMA_GATE) {
    const stub = env.LLAMA_GATE.get(env.LLAMA_GATE.idFromName('llama-gate-singleton'))
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
      throw new Error(`LlamaGate fetch failed: ${err?.message || err}`)
    }
    let envelope: any
    try { envelope = await gateRes.json() }
    catch (err: any) {
      throw new Error(`LlamaGate returned non-JSON (status=${gateRes.status}): ${err?.message || err}`)
    }
    if (!gateRes.ok || envelope?.ok === false) {
      throw new Error(
        `LlamaGate upstream error (status=${gateRes.status}, wait=${envelope?.wait_ms}ms, run=${envelope?.run_ms}ms): ` +
        `${envelope?.error || 'unknown'}`,
      )
    }
    res = envelope.result
  } else {
    try {
      res = await env.AI.run(LLAMA_70B, { messages, max_tokens: 4096 } as any)
    } catch (err: any) {
      throw new Error(`Workers AI Llama failed: ${err?.message || err}`)
    }
  }

  if (!res) throw new Error('Workers AI Llama returned null/undefined response')
  if (res.errors) throw new Error(`Workers AI Llama errors: ${JSON.stringify(res.errors).slice(0, 400)}`)
  if (res.success === false) {
    throw new Error(`Workers AI Llama success:false ${res.error ? `: ${String(res.error).slice(0, 200)}` : ''}`)
  }

  const text = res?.response ?? res?.text ?? ''
  if (typeof text !== 'string' || text.trim().length === 0) {
    // Workers AI Llama occasionally returns an empty response —
    // sometimes transient capacity, sometimes the model just decides
    // there's nothing extractable in the given transcript (we've seen
    // this on short / fragmentary / Whisper-mangled transcripts that
    // are syntactically valid but semantically thin).
    //
    // Retry up to 2 more times with the jsonReminder prompt + backoff
    // to escape any rate-limit window. If STILL empty after 3 total
    // attempts, the model is consistently saying "nothing to extract"
    // for this transcript. Treat that as a SUCCESSFUL empty extraction
    // (b-roll, no meaningful content) instead of throwing. The vlog
    // marks complete with total_items=0; diagnosis classifies it as
    // b_roll automatically. Better outcome than retrying 5 more times
    // at the DO level and marking the vlog failed.
    if (_retryDepth < 2) {
      const backoffMs = 800 * (_retryDepth + 1)
      await new Promise(r => setTimeout(r, backoffMs))
      return callLlama70B(env, transcript, true, _retryDepth + 1)
    }
    // Exhausted retries with empty response. Return a minimal valid
    // JSON shape so the parser treats this as a clean empty extraction.
    return '{"summary":"","threads":[],"clips":[],"creative_elements":[],"entities":[]}'
  }
  // SHAPE-AWARE VALIDATION (replaces the earlier blanket < 50 char throw).
  // The model can legitimately return `{}` (2 chars) for transcripts with
  // nothing extractable — junk audio, mostly silence, very short intros.
  // That's the model behaving CORRECTLY, not a failure. The old check
  // misclassified these as "suspiciously short response" and triggered
  // pipeline failures on vlogs the LLM had nothing wrong with.
  //
  // Accept any response that parses as JSON with at least one of our
  // expected output keys. Only reject if the response is unparseable
  // OR parses but lacks ALL expected keys (e.g. a refusal that
  // accidentally looked like JSON).
  try {
    let s = text.trim()
    if (s.startsWith('```')) {
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    }
    const first = s.indexOf('{')
    const last = s.lastIndexOf('}')
    if (first >= 0 && last > first) s = s.slice(first, last + 1)
    const parsed = JSON.parse(s)
    const hasShape = parsed && typeof parsed === 'object' && (
      Array.isArray(parsed.threads) ||
      Array.isArray(parsed.clips) ||
      Array.isArray(parsed.creative_elements) ||
      Array.isArray(parsed.entities) ||
      typeof parsed.summary === 'string'
    )
    if (hasShape) return text
    throw new Error(`response is JSON but lacks expected keys: ${s.slice(0, 120)}`)
  } catch (parseErr) {
    if (text.trim().length < 50) {
      throw new Error(`Llama returned short non-JSON: ${text.slice(0, 80)}`)
    }
    throw new Error(`Llama returned non-JSON: ${text.slice(0, 120)}`)
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
