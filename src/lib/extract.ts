/**
 * Three-pass extraction — runs against a vlog's transcript after transcribe
 * completes. Called from the process-upload Workflow as its fan-out tail.
 *
 *   extractThreads        analytical pass → threads table
 *   extractClipCandidates clip-candidate pass → clip_candidates table
 *   extractCreativeElements creative-mode pass → creative_elements table (rare)
 *   extractEntities       entity extraction → entities + entity_mentions
 *
 * All four read their prompt from the `prompts` table (versioned). Output
 * rows carry the extraction_prompt_version they were produced under.
 *
 * Voice preservation hard check (analytical pass only): each thread's `take`
 * and at least one `key_quote.text` must contain a verbatim 4+ word substring
 * from the source transcript. Failed runs are LOGGED + SKIPPED — they do NOT
 * write to the threads table. This is enforced per CLAUDE.md.
 */

import type { D1Database, Ai } from '@cloudflare/workers-types'
import { run, batch, findOne } from './d1'
import { ulid } from './ulid'
import { loadPrompt } from './anthropic'
import { callLlm, parseLlmJson, type Tier, type Pass } from './llm'

export interface ExtractEnv {
  DB: D1Database
  AI: Ai
  ANTHROPIC_API_KEY: string
}

interface VlogContext {
  vlog_id: string
  operator_id: string
  transcript_text: string
  tier: Tier  // free | premium | max — picked per-vlog by the operator
}

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Voice-preservation check: does `candidate` contain a verbatim 4+ word
 * substring of `source`? Whitespace-insensitive, case-insensitive.
 */
function hasVerbatim4Words(candidate: string, source: string): boolean {
  const cand = normalizeWhitespace(candidate)
  const src = normalizeWhitespace(source)
  if (!cand || !src) return false
  // Slide a 4-word window over the source and check substring presence
  const sourceWords = src.split(' ')
  for (let i = 0; i + 4 <= sourceWords.length; i++) {
    const window = sourceWords.slice(i, i + 4).join(' ')
    if (cand.includes(window)) return true
  }
  return false
}

async function recordExtractionRun(
  db: D1Database,
  vlogId: string,
  pass: string,
  promptVersion: string,
  model: string,
  outputCount: number,
  err: string | null,
  costUsd: number | null,
): Promise<void> {
  await run(
    db,
    `INSERT INTO extraction_runs (id, vlog_id, pass, prompt_version, started_at,
       completed_at, output_count, error, model, cost_usd)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
    ulid(), vlogId, pass, promptVersion, outputCount, err, model, costUsd,
  )
}

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  // Pricing (subject to change):
  //   claude-sonnet-4-6:       $3.00 / Mtok in, $15.00 / Mtok out
  //   claude-haiku-4-5:        $1.00 / Mtok in,  $5.00 / Mtok out
  //   kimi-k2.6 (Workers AI):  $0.74 / Mtok in,  $3.50 / Mtok out
  //   llama-4-scout (WAI):     $0.27 / Mtok in,  $0.85 / Mtok out
  //   llama-3.3-70b (WAI):     $0.06 / Mtok in,  $0.25 / Mtok out
  const m = model.toLowerCase()
  if (m.includes('kimi')) {
    return (inputTokens / 1_000_000) * 0.74 + (outputTokens / 1_000_000) * 3.50
  }
  if (m.includes('llama-4-scout') || m.includes('llama-4')) {
    return (inputTokens / 1_000_000) * 0.27 + (outputTokens / 1_000_000) * 0.85
  }
  if (m.includes('llama')) {
    return (inputTokens / 1_000_000) * 0.06 + (outputTokens / 1_000_000) * 0.25
  }
  const isHaiku = m.includes('haiku')
  const inPerMtok = isHaiku ? 1.0 : 3.0
  const outPerMtok = isHaiku ? 5.0 : 15.0
  return (inputTokens / 1_000_000) * inPerMtok + (outputTokens / 1_000_000) * outPerMtok
}

// ─── analytical pass: threads ────────────────────────────────────────────────

export async function extractThreads(env: ExtractEnv, ctx: VlogContext): Promise<{ inserted: number; rejected: number }> {
  const prompt = await loadPrompt(env.DB, 'thread_extraction')

  let llmResp
  try {
    llmResp = await callLlm(env, ctx.tier, 'threads', {
      system: prompt.body,
      user: `Transcript:\n\n${ctx.transcript_text}`,
      maxTokens: 8192,
      expectJson: true,
    })
  } catch (err: any) {
    await recordExtractionRun(env.DB, ctx.vlog_id, 'analytical', prompt.version, prompt.model, 0, err.message, null)
    throw err
  }

  let parsed: { threads?: any[] }
  try {
    parsed = parseLlmJson(llmResp.text)
  } catch (err: any) {
    await recordExtractionRun(env.DB, ctx.vlog_id, 'analytical', prompt.version, llmResp.model, 0, err.message, estimateCost(llmResp.inputTokens, llmResp.outputTokens, llmResp.model))
    throw err
  }

  const threads = Array.isArray(parsed.threads) ? parsed.threads : []
  let rejected = 0
  const inserts: { sql: string; binds: unknown[] }[] = []

  for (const t of threads) {
    // Voice preservation hard rule (CLAUDE.md): take and at least one key_quote
    // must each contain a verbatim 4+ word substring from the source transcript.
    const take = typeof t.take === 'string' ? t.take : null
    const keyQuotes: { text: string; start_time?: number; end_time?: number }[] = Array.isArray(t.key_quotes)
      ? t.key_quotes.filter((q: any) => q && typeof q.text === 'string')
      : []

    const takeValid = take === null || hasVerbatim4Words(take, ctx.transcript_text)
    const someQuoteValid = keyQuotes.some(q => hasVerbatim4Words(q.text, ctx.transcript_text))

    if (!takeValid || (keyQuotes.length > 0 && !someQuoteValid)) {
      // Voice was sanitized. Log + skip — do NOT write.
      rejected++
      console.warn(`[extract-threads] voice preservation failed for vlog ${ctx.vlog_id}, topic="${t.topic?.slice(0, 60)}"`)
      continue
    }

    inserts.push({
      sql: `INSERT INTO threads (
              id, operator_id, vlog_id, topic, take, key_quotes, questions_raised,
              register, strength, transcript_span_start, transcript_span_end,
              abstracted_topic, extraction_prompt_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        ulid(),
        ctx.operator_id,
        ctx.vlog_id,
        String(t.topic ?? ''),
        take,
        JSON.stringify(keyQuotes),
        JSON.stringify(Array.isArray(t.questions_raised) ? t.questions_raised : []),
        ['riff','observation','argument','story','aside','question'].includes(t.register) ? t.register : null,
        Number.isInteger(t.strength) && t.strength >= 1 && t.strength <= 5 ? t.strength : null,
        typeof t.transcript_span_start === 'number' ? t.transcript_span_start : null,
        typeof t.transcript_span_end === 'number' ? t.transcript_span_end : null,
        typeof t.abstracted_topic === 'string' ? t.abstracted_topic : null,
        prompt.version,
      ],
    })
  }

  if (inserts.length > 0) {
    await batch(env.DB, inserts)
  }

  const cost = estimateCost(llmResp.inputTokens, llmResp.outputTokens, llmResp.model)
  await recordExtractionRun(env.DB, ctx.vlog_id, 'analytical', prompt.version, llmResp.model, inserts.length, null, cost)

  return { inserted: inserts.length, rejected }
}

// ─── clip-candidate pass ─────────────────────────────────────────────────────

export async function extractClipCandidates(env: ExtractEnv, ctx: VlogContext): Promise<{ inserted: number }> {
  const prompt = await loadPrompt(env.DB, 'clip_candidate_extraction')

  let llmResp
  try {
    llmResp = await callLlm(env, ctx.tier, 'clip_candidates', {
      system: prompt.body,
      user: `Transcript:\n\n${ctx.transcript_text}`,
      maxTokens: 4096,
      expectJson: true,
    })
  } catch (err: any) {
    await recordExtractionRun(env.DB, ctx.vlog_id, 'clip_candidate', prompt.version, prompt.model, 0, err.message, null)
    throw err
  }

  const parsed = parseLlmJson<{ clip_candidates?: any[] }>(llmResp.text)
  const candidates = Array.isArray(parsed.clip_candidates) ? parsed.clip_candidates : []

  const inserts = candidates
    .filter(c =>
      c && typeof c.start_time === 'number' && typeof c.end_time === 'number' &&
      c.end_time > c.start_time && typeof c.headline === 'string',
    )
    .map(c => ({
      sql: `INSERT INTO clip_candidates (
              id, operator_id, vlog_id, start_time, end_time, headline, quote,
              why_clippable, extraction_prompt_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        ulid(), ctx.operator_id, ctx.vlog_id,
        c.start_time, c.end_time, c.headline,
        typeof c.quote === 'string' ? c.quote : null,
        JSON.stringify(Array.isArray(c.why_clippable) ? c.why_clippable : []),
        prompt.version,
      ],
    }))

  if (inserts.length > 0) await batch(env.DB, inserts)
  const cost = estimateCost(llmResp.inputTokens, llmResp.outputTokens, llmResp.model)
  await recordExtractionRun(env.DB, ctx.vlog_id, 'clip_candidate', prompt.version, llmResp.model, inserts.length, null, cost)
  return { inserted: inserts.length }
}

// ─── creative-mode pass ─────────────────────────────────────────────────────

export async function extractCreativeElements(env: ExtractEnv, ctx: VlogContext): Promise<{ inserted: number }> {
  const prompt = await loadPrompt(env.DB, 'creative_extraction')

  let llmResp
  try {
    llmResp = await callLlm(env, ctx.tier, 'creative_elements', {
      system: prompt.body,
      user: `Transcript:\n\n${ctx.transcript_text}`,
      maxTokens: 4096,
      expectJson: true,
    })
  } catch (err: any) {
    await recordExtractionRun(env.DB, ctx.vlog_id, 'creative_mode', prompt.version, prompt.model, 0, err.message, null)
    throw err
  }

  const parsed = parseLlmJson<{ creative_elements?: any[] }>(llmResp.text)
  const elements = Array.isArray(parsed.creative_elements) ? parsed.creative_elements : []

  const VALID_TYPES = new Set(['character_beat','scene_fragment','dialogue','theme','setting','tonal_reference','plot_fragment'])
  const inserts = elements
    .filter(e => e && VALID_TYPES.has(e.element_type) && typeof e.content === 'string')
    .map(e => ({
      sql: `INSERT INTO creative_elements (
              id, operator_id, vlog_id, element_type, content, register,
              transcript_span_start, transcript_span_end, extraction_prompt_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        ulid(), ctx.operator_id, ctx.vlog_id,
        e.element_type, e.content,
        typeof e.register === 'string' ? e.register : null,
        typeof e.transcript_span_start === 'number' ? e.transcript_span_start : null,
        typeof e.transcript_span_end === 'number' ? e.transcript_span_end : null,
        prompt.version,
      ],
    }))

  if (inserts.length > 0) await batch(env.DB, inserts)
  const cost = estimateCost(llmResp.inputTokens, llmResp.outputTokens, llmResp.model)
  await recordExtractionRun(env.DB, ctx.vlog_id, 'creative_mode', prompt.version, llmResp.model, inserts.length, null, cost)
  return { inserted: inserts.length }
}

// ─── entity extraction ─────────────────────────────────────────────────────

export async function extractEntities(env: ExtractEnv, ctx: VlogContext): Promise<{ entitiesUpserted: number; mentionsInserted: number }> {
  const prompt = await loadPrompt(env.DB, 'entity_extraction')

  let llmResp
  try {
    llmResp = await callLlm(env, ctx.tier, 'entities', {
      system: prompt.body,
      user: `Transcript:\n\n${ctx.transcript_text}`,
      maxTokens: 4096,
      expectJson: true,
    })
  } catch (err: any) {
    await recordExtractionRun(env.DB, ctx.vlog_id, 'entity', prompt.version, prompt.model, 0, err.message, null)
    throw err
  }

  const parsed = parseLlmJson<{ entities?: any[] }>(llmResp.text)
  const entitiesIn = Array.isArray(parsed.entities) ? parsed.entities : []

  const VALID_ENTITY_TYPES = new Set(['person','place','project','tool','concept','theme','reference'])

  let entitiesUpserted = 0
  let mentionsInserted = 0

  for (const ent of entitiesIn) {
    if (!ent || typeof ent.name !== 'string' || !VALID_ENTITY_TYPES.has(ent.entity_type)) continue
    const name = ent.name.trim()
    if (!name) continue

    // Find-or-create entity by (operator_id, name) case-insensitive
    const existing = await findOne<{ id: string }>(
      env.DB,
      'SELECT id FROM entities WHERE operator_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1',
      ctx.operator_id, name,
    )
    let entityId = existing?.id
    if (!entityId) {
      entityId = ulid()
      await run(
        env.DB,
        `INSERT INTO entities (id, operator_id, name, entity_type, first_mentioned_at, last_mentioned_at, mention_count)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
        entityId, ctx.operator_id, name, ent.entity_type,
      )
      entitiesUpserted++
    }

    const mentions: any[] = Array.isArray(ent.mentions) ? ent.mentions : []
    const mentionInserts = mentions
      .filter(m => m && typeof m.mention_text === 'string')
      .map(m => ({
        sql: `INSERT INTO entity_mentions (id, entity_id, operator_id, source_kind, source_id,
                mention_text, mention_time, confidence)
              VALUES (?, ?, ?, 'vlog', ?, ?, ?, ?)`,
        binds: [
          ulid(), entityId, ctx.operator_id, ctx.vlog_id,
          m.mention_text,
          typeof m.mention_time === 'number' ? m.mention_time : null,
          typeof m.confidence === 'number' ? m.confidence : null,
        ],
      }))

    if (mentionInserts.length > 0) {
      await batch(env.DB, mentionInserts)
      mentionsInserted += mentionInserts.length
    }
    // Update mention_count + last_mentioned_at
    await run(
      env.DB,
      `UPDATE entities SET mention_count = mention_count + ?, last_mentioned_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      mentionInserts.length, entityId,
    )
  }

  const cost = estimateCost(llmResp.inputTokens, llmResp.outputTokens, llmResp.model)
  await recordExtractionRun(env.DB, ctx.vlog_id, 'entity', prompt.version, llmResp.model, entitiesIn.length, null, cost)
  return { entitiesUpserted, mentionsInserted }
}
