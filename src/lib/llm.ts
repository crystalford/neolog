/**
 * LLM router — three tiers for extraction, transcription, and any other AI
 * work. The operator picks the tier per vlog (or sets a default in Settings).
 *
 *   free    → Workers AI Llama 3.3 70B for everything. ~$0.003/vlog.
 *   premium → Claude Sonnet 4.6 for threads + creative, Llama for clips +
 *             entities. Best balance of quality and cost. ~$0.08/vlog.
 *   max     → Claude Sonnet 4.6 for all 4 passes. ~$0.15/vlog.
 *
 * Cost numbers are estimates for a ~20-min vlog at current pricing. Adjust
 * COST_TABLE when models or pricing change.
 *
 * Workers AI endpoint: env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', ...)
 * Anthropic endpoint: api.anthropic.com/v1/messages with env.ANTHROPIC_API_KEY
 */

import type { Ai } from '@cloudflare/workers-types'
import { callClaude, parseClaudeJson } from './anthropic'

export type Tier = 'free' | 'premium' | 'max'
export type Pass = 'threads' | 'clip_candidates' | 'creative_elements' | 'entities'

const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const CLAUDE_SONNET = 'claude-sonnet-4-6'

/**
 * Route a pass to the right provider based on tier.
 * Returns the model identifier we'll actually call.
 */
export function modelFor(tier: Tier, pass: Pass): { provider: 'workers_ai' | 'claude'; model: string } {
  if (tier === 'max') {
    return { provider: 'claude', model: CLAUDE_SONNET }
  }
  if (tier === 'premium') {
    // Sonnet for the passes where voice nuance matters
    if (pass === 'threads' || pass === 'creative_elements') {
      return { provider: 'claude', model: CLAUDE_SONNET }
    }
    return { provider: 'workers_ai', model: WORKERS_AI_MODEL }
  }
  return { provider: 'workers_ai', model: WORKERS_AI_MODEL }
}

/**
 * Cost estimate per pass at the given tier. Returns USD.
 * Used by the UI to show "this will spend ~$X" before re-running.
 *
 * Numbers assume a ~20-minute vlog: ~3000 transcript words = ~4000 tokens in,
 * ~2000 tokens out per pass.
 */
const COST_PER_VLOG: Record<Tier, Record<Pass, number>> = {
  // Workers AI Llama 70B: $0.06/M input, $0.25/M output
  free: {
    threads:           0.0006,  // 4000 input + 2000 output tokens
    clip_candidates:   0.0006,
    creative_elements: 0.0006,
    entities:          0.0006,
  },
  // Premium: Sonnet for threads + creative, Llama for clips + entities
  premium: {
    threads:           0.040,   // 4000 input @ $3/M + 2000 output @ $15/M
    clip_candidates:   0.0006,
    creative_elements: 0.040,
    entities:          0.0006,
  },
  // Max: Sonnet for all 4
  max: {
    threads:           0.040,
    clip_candidates:   0.040,
    creative_elements: 0.040,
    entities:          0.040,
  },
}

export function estimateCost(tier: Tier, passes: Pass[] = ['threads', 'clip_candidates', 'creative_elements', 'entities']): number {
  return passes.reduce((sum, p) => sum + COST_PER_VLOG[tier][p], 0)
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  if (usd < 1) return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(2)}`
}

interface LlmCallArgs {
  system: string
  user: string
  maxTokens?: number
  expectJson?: boolean
}

interface LlmResponse {
  text: string
  inputTokens: number
  outputTokens: number
  provider: 'workers_ai' | 'claude'
  model: string
}

/**
 * Unified LLM call. Routes to Workers AI Llama or Anthropic Claude based on tier+pass.
 */
export async function callLlm(
  env: { AI: Ai; ANTHROPIC_API_KEY: string },
  tier: Tier,
  pass: Pass,
  args: LlmCallArgs,
): Promise<LlmResponse> {
  const route = modelFor(tier, pass)

  if (route.provider === 'claude') {
    const r = await callClaude(env, {
      model: route.model,
      system: args.system,
      messages: [{ role: 'user', content: args.user }],
      maxTokens: args.maxTokens ?? 4096,
      expectJson: args.expectJson,
    })
    return {
      text: r.text,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      provider: 'claude',
      model: r.model,
    }
  }

  // Workers AI path. Llama 3.3 70B expects chat-style messages.
  const userMsg = args.expectJson
    ? args.user + '\n\nReturn ONLY valid JSON. No prose, no markdown fences.'
    : args.user
  const result: any = await env.AI.run(route.model as any, {
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: userMsg },
    ],
    max_tokens: args.maxTokens ?? 4096,
  })
  const text = stripJsonFences(String(result?.response ?? ''))
  return {
    text,
    inputTokens: result?.usage?.prompt_tokens ?? 0,
    outputTokens: result?.usage?.completion_tokens ?? 0,
    provider: 'workers_ai',
    model: route.model,
  }
}

/**
 * Parse a JSON response from either provider. Same shape as parseClaudeJson.
 */
export function parseLlmJson<T = unknown>(text: string): T {
  try {
    return JSON.parse(text)
  } catch (err: any) {
    throw new Error(`LLM returned malformed JSON: ${err.message}\nFirst 400 chars: ${text.slice(0, 400)}`)
  }
}

function stripJsonFences(text: string): string {
  const t = text.trim()
  if (t.startsWith('```json')) return t.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  if (t.startsWith('```')) return t.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  return t
}

// Re-export so callers can keep using one import.
export { parseClaudeJson }
