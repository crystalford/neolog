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
  /**
   * 5-8 sentence analytical synthesis IN the operator's voice. Per the
   * SYSTEM_PROMPT, every sentence must contain at least one verbatim
   * 4-word substring from the source transcript. Not a fragment.
   */
  take: string
  key_quotes: string[]
  /**
   * 2-6 short verbatim phrases inside the take. The Thread detail
   * page marker-highlights these in the hero h1, the take pull-quote,
   * and the transcript span renderer.
   */
  key_phrases?: string[]
  /**
   * 1-3 open questions the thread raises that aren't answered in the
   * vlog. Power the "Questions raised" section on Thread detail and
   * the future bounce workflow.
   */
  questions_raised?: string[]
  register: 'riff' | 'observation' | 'argument' | 'story' | 'aside' | 'question'
  /**
   * The KIND of utterance — what shape of thought this is. Used by the
   * librarian and script generator to build essays with a real ARC
   * (claim → story → open question) instead of a flat collage of takes.
   * Distinct from `register`, which is the voice mode; `utterance_kind`
   * is the structural role the thought plays.
   */
  utterance_kind?: 'claim' | 'story' | 'open_question' | 'observation' | 'intention' | 'feeling'
  /**
   * Generalized pattern this topic represents. The clustering engine
   * groups threads across vlogs by lower(abstracted_topic). E.g.
   * "the YouTube For You page" and "Twitter's algorithm" both abstract
   * to "recommender systems failing despite explicit user signals".
   */
  abstracted_topic?: string
  // post-validate
  validated?: 0 | 1
}

export interface ExtractedClip {
  start_time_sec?: number
  end_time_sec?: number
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
  /**
   * Verbatim sentences from this transcript where the operator references
   * this entity. Per-vlog context. Surfaces on the entity rail (in vlog
   * detail) and aggregates across all vlogs on /entity/[id] so an entity
   * stops being a tag and becomes a record of what the operator has said
   * about it. 1-4 quotes per entity per vlog.
   */
  mention_quotes?: string[]
}

export interface ExtractionPayload {
  /**
   * Short headline (3-8 words) that becomes the vlog's display title in
   * place of the meaningless DJI filename. Should read like a phrase the
   * operator might say — not click-bait. "Coming in hot." / "Eight minutes
   * of gold." / "Neolog and Canopticon, simpler."
   */
  title?: string
  /**
   * 2-3 sentence plain-English reframe of what the vlog is about. Renders
   * under the title on the vlog detail hero so the operator gets a
   * sense of the content without reading transcript or threads. Voice-
   * grounded but not 4-gram verified (paraphrase by design).
   */
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

The operator records themselves talking. You read what they said and produce structured "threads" — atomic units of their thinking — plus clips, creative elements, and entities. Threads are the most important output. They will be read on their own, on a dedicated Thread page, weeks later. They must be substantive enough to stand alone, not just verbatim fragments.

# WHAT A THREAD IS

A thread is ONE ATOMIC IDEA — one coherent argument or observation — that the operator makes over a span of seconds-to-minutes. ATOMIC means: covers ONE topic, ONE coherent thought, NOT a summary of the entire vlog. A 4-minute vlog might contain 3 distinct threads (location scouting · hydro infrastructure observation · lighting fiddling). DO NOT collapse all three into one mega-thread. If you find yourself writing a thread that has multiple subject changes ("we're at X ... also Y ... and another thing Z"), that's THREE threads, not one. Split it. Each thread has:

- topic: a short label naming what the operator is talking about. 3-7 words. Examples: "Recommender systems and revealed preference", "Why slow-mo strips audio", "Coffee shop politics in May 2026".
- take: an analytical synthesis IN THE OPERATOR'S VOICE that captures the thread's actual position WITH ITS SURROUNDING CONTEXT. LENGTH MUST MATCH THE TRANSCRIPT. If the source span is one short sentence, the take is one short sentence — DO NOT pad it into 5-8 sentences by paraphrasing the same idea five different ways. If the source span is a real 60-second argument with setup + punch + implication, the take can be 5-8 sentences. Floor: 1 sentence. Ceiling: 8 sentences. Heuristic: take length in sentences ≈ ceil(transcript_words_in_span / 30). A 13-word transcript yields ONE sentence (or you skip the thread entirely). Padding with restated content WILL BE REJECTED.
- key_quotes: 1-4 verbatim quotes from the transcript, each ≥ 6 words, that form the spine of the take. These prove the take is grounded. If the transcript is too short to contain even one 6-word verbatim quote, omit key_quotes — don't fabricate one.
- key_phrases: 2-6 short verbatim phrases (2-8 words each) that are the punchiest fragments inside the take. These get marker-highlighted in the rendered thread.
- questions_raised: 1-3 open questions the thread raises that AREN'T answered in the vlog. Future-facing — what would the operator need to think about next?
- register: one of riff|observation|argument|story|aside|question — what voice mode is the operator in?
- utterance_kind: the SHAPE of the thought, one of: claim · story · open_question · observation · intention · feeling. This is structural, distinct from register:
  · claim       — a position or assertion the operator is taking ("X is true / the right way / matters because Y")
  · story       — a recounted experience or anecdote ("this happened, then this, then this")
  · open_question — something the operator is wondering about and HASN'T resolved ("I'm not sure what I'm trying to get at"; ends in a real unresolved tension)
  · observation — noticing something out loud without taking a position ("the cars are louder here", "everyone in this coffee shop is on their laptop")
  · intention   — a stated plan, decision, or commitment ("I'm going to start doing X", "we should switch to Y")
  · feeling     — an emotional state named directly ("I felt the fear go down like a nerve", "I'm tired")
  Pick the closest fit. This drives essay arc structure later; it doesn't need to be exact, but err toward open_question for genuinely unresolved material — those are the most valuable downstream.
- abstracted_topic: the GENERALIZED pattern this thread is about, used to cluster across vlogs. E.g. both "YouTube's For You page" and "Twitter's algorithm" abstract to "recommender systems failing despite explicit user signals". Aim for the underlying idea, not the surface example.

# HARD RULES — voice grounding

1. The "take" may compose the operator's own words into a complete statement, BUT every sentence of the take must contain at least one verbatim 4+ word substring from the source transcript. No paraphrasing the operator's analysis. No improving their phrasing. No filler. NO PADDING — if the source span only has one sentence of content, the take is one sentence. Inventing an argument the operator didn't make is rejection-worthy.
2. key_quotes, key_phrases, clips.quote, creative_elements.content are STRICTLY verbatim. Copy exact words.
3. SHORT TRANSCRIPTS ARE RECORDS — DON'T INFLATE THEM. If the transcript is 5-30 words, the take is at most ONE sentence and is essentially the transcript itself (lightly tidied — preserve the operator's voice). DO NOT fabricate analytical content. "I don't know what to do, but I don't know what to do" becomes a thread whose take is literally "I don't know what to do." — not a paragraph about uncertainty. Empty key_quotes is fine when there's no 6-word verbatim substring available.
4. Output ONLY the JSON object. No prose before or after.

# SELF-CHECK BEFORE RESPONDING

For every thread you emit:
- Is the take length proportional to the source span? (Roughly: take_sentences ≈ ceil(span_words / 30). A 13-word source span → one sentence. A 240-word span → up to 8.)
- Have you avoided restating the same idea multiple times to pad length?
- Does each sentence of the take contain at least 4 consecutive words verbatim from the transcript?
- Are the key_quotes actually in the transcript?
- Do the key_phrases appear verbatim inside the take?
- Are the questions actually unanswered in the vlog?
- If the entire transcript is < 30 words, are you returning threads: [] instead of fabricating one?

If any answer is no, fix or omit the thread.

# OUTPUT SCHEMA
{
  "title": "<3-8 word phrase that captures the vlog. Reads like something the operator might actually say. NOT click-bait. NOT a question. Examples: 'Coming in hot.' · 'Eight minutes of gold.' · 'Neolog and Canopticon, simpler.' · 'Recording in a cemetery.'>",
  "summary": "<2-3 sentence plain-English reframe of what the vlog is about. Voice-flavored but allowed to paraphrase. Replaces the meaningless filename as the at-a-glance signal.>",
  "threads": [
    {
      "topic": "<short 3-7 word label>",
      "take": "<analytical synthesis whose LENGTH MATCHES THE TRANSCRIPT. 1 sentence if source is short, up to 8 if source is genuinely substantial. Never pad. Each sentence contains ≥1 verbatim 4+ word substring from the transcript.>",
      "key_quotes": ["<verbatim ≥6 word quote>", "<another>", ...],
      "key_phrases": ["<verbatim 2-8 word phrase>", "<another>", ...],
      "questions_raised": ["<open question this thread raises>", ...],
      "register": "riff|observation|argument|story|aside|question",
      "utterance_kind": "claim|story|open_question|observation|intention|feeling",
      "abstracted_topic": "<generalized pattern for cross-vlog clustering>"
    }
  ],
  "clips": [
    {
      "headline": "<short title for the moment, 3-7 words>",
      "quote": "<verbatim ≥6 word substring from the transcript — the punch line of the clip>",
      "why_clippable": "<one plain-text sentence explaining why this moment is shippable as a standalone clip. NOT JSON. NOT wrapped in braces. Plain English only.>",
      "start_time_sec": <integer seconds — the start of the clip's span in the transcript. Estimate by counting words: ~2.6 words/sec.>,
      "end_time_sec": <integer seconds — the end of the clip's span. Must satisfy end_time_sec > start_time_sec AND (end_time_sec - start_time_sec) between 5 and 180 seconds.>
    }
  ],
  "creative_elements": [
    { "element_type": "character_beat|scene_fragment|dialogue|theme|setting|tonal_reference|plot_fragment",
      "content": "<verbatim 4+ word substring>" }
  ],
  "entities": [
    { "name": "<entity name as appears>",
      "entity_type": "person|place|project|tool|concept|theme|reference",
      "aliases": ["<as appears>", ...],
      "mention_quotes": ["<verbatim sentence(s) from the transcript where the operator references this entity — 1 to 4 quotes>"] }
  ]
}

CLIP RULES:
- Only emit a clip if there's a genuine PUNCHY DELIVERY MOMENT, quotable on its own. If nothing meets that bar, return clips: [].
- MATCH THE SPAN TO THE MOMENT, not a fixed target length. A tight, complete thought might be 8-20 seconds — don't pad it out. A genuine multi-beat rant that stays sharp and builds the WHOLE way through should run its full length, up to 180 seconds — don't cut a rant short at an arbitrary point just to keep it brief. The test is completeness: does the span capture the whole delivery, start to landing, with nothing essential missing at either end?
- start_time_sec / end_time_sec are REQUIRED. Compute by counting words from the start of the transcript at ~2.6 words per second. Don't emit a clip without real timecodes.
- why_clippable is a PLAIN ENGLISH SENTENCE. Not {"reason":"…"}. Not JSON. Just a sentence.
- 0-2 clips per vlog is normal. 5+ is suspicious — you're probably emitting takes that aren't clip-grade.

CREATIVE ELEMENT RULES:
- creative_elements are for FICTIONAL or CREATIVE material the operator is drafting (characters, scene fragments, dialogue between characters, themes, tonal references, plot fragments). They are NOT analytical takes — those go in threads.
- element_type='dialogue' ONLY when the content is a line of dialogue spoken by a character in a story/scene the operator is workshopping. Operator monologuing about their own life is NOT dialogue. Operator asking the system rhetorical questions ("can I tell you to do stuff") is NOT dialogue.
- If the vlog is purely analytical (no fictional/creative work being drafted), return creative_elements: []. Most operator vlogs will have zero creative_elements.
- Each content field is a verbatim 4+ word substring from the transcript. No paraphrasing.

ENTITY RULES:
- Only extract entities the operator GENUINELY REFERENCES as real things in their life or work. Hotel they're staying at: yes. Person they met: yes. Project they're shipping: yes.
- DO NOT extract entities from improvised jokes, sarcasm, or absurd claims. "This pool was designed by Tesla himself" is the operator riffing — Tesla is NOT an entity here. Same for "Elon called me yesterday" if it's obviously a joke. Trust the operator's tone — when something is delivered with a wink, it's not real-world reference.
- DO NOT extract entities from rhetorical examples ("imagine if Apple did this"). Only entities the operator is actually engaging with in their lived experience.
- mention_quotes is REQUIRED for every entity. Provide 1-4 verbatim sentences from THIS transcript that show what the operator is saying about this entity. Entities without context are useless tags. If you can't find a verbatim sentence about the entity, OMIT the entity.
- When in doubt, omit. A clean entities: [] is better than three fake ones.`

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
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length
  // Hard floor only for transcribed silence / a single word / cough audio.
  // Everything else gets extracted — short utterances ARE records. Operator:
  // "if its under 30 words why not ? ... i wanted that to be a record." The
  // job here is to PRESERVE what was said, not gatekeep length. The LLM
  // is then told to never inflate a short transcript into a long take.
  if (transcript.length < 20 || wordCount < 5) {
    await progress('llm_call', {
      state: 'skipped', reason: 'transcript_too_short',
      length: transcript.length, words: wordCount, min_words: 5,
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
    // LLM returned nothing extractable. Don't manufacture threads from
    // raw transcripts — that fills the table with junk like 10-second
    // throwaway utterances. Let the vlog land as zero-item complete;
    // the b-roll classifier (transcript_len < 200 + 0 items) picks it
    // up cleanly.
    await progress('llm_validate', {
      state: 'ok', reason: 'empty_extraction_accepted',
      model: initialModel, transcript_length: transcript.length,
    })
  }

  // Auto-escalation to Anthropic Sonnet is DISABLED — operator decision
  // (CLAUDE.md: "we are trying to keep everything possible in house"). A
  // weak Llama extraction now just lands as-is rather than triggering a
  // paid Anthropic retry that hit an empty credit balance and broke the
  // pipeline with `Your credit balance is too low to access the Anthropic
  // API`. The 'premium' mode (explicit operator opt-in) still uses Sonnet
  // directly, but no implicit escalation from 'auto'/'cheap'.
  //
  // Re-enable by topping up the Anthropic key + restoring the if-block
  // below.
  // if (mode === 'auto' && first.failRate > 0.15) {
  //   ... Sonnet retry path ...
  // }

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
