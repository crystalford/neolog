/**
 * LLM router — three tiers for extraction, transcription, and any other AI
 * work. The operator picks the tier per vlog (or sets a default in Settings).
 *
 *   free    → Workers AI Kimi K2.6 for all four passes. ~$0.04/vlog.
 *             (1T MoE / 32B active, 262K context, vision, agentic-tuned —
 *             closest-to-Claude voice. Worth the ~4× cost over Scout for
 *             threads + creative_elements where voice/register nuance
 *             matters most.)
 *   premium → Claude Sonnet 4.6 for threads + creative, Kimi for clips +
 *             entities. Best balance of quality and cost. ~$0.10/vlog.
 *   max     → Claude Sonnet 4.6 for all 4 passes. ~$0.17/vlog.
 *
 * Cost numbers are estimates for a ~20-min vlog at current pricing. Adjust
 * COST_TABLE when models or pricing change.
 *
 * Three Workers AI models are available via the chat picker + Settings:
 *   - KIMI_K2_6      best agentic/chat voice, 32B active of 1T MoE, 262K ctx (default)
 *   - LLAMA_4_SCOUT  cheapest, multimodal, MoE 17B active, 131K ctx (speed/cost option)
 *   - LLAMA_70B      fallback dense model, no vision
 *
 * Anthropic endpoint: api.anthropic.com/v1/messages with env.ANTHROPIC_API_KEY
 */

import type { Ai } from '@cloudflare/workers-types'
import { callClaude, parseClaudeJson } from './anthropic'

export type Tier = 'free' | 'premium' | 'max'
export type Pass = 'threads' | 'clip_candidates' | 'creative_elements' | 'entities'

const LLAMA_4_SCOUT = '@cf/meta/llama-4-scout-17b-16e-instruct'
const KIMI_K2_6 = '@cf/moonshotai/kimi-k2.6'
const LLAMA_70B = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'  // kept as a fallback
const WORKERS_AI_MODEL = KIMI_K2_6  // default Workers AI model for extraction
const CLAUDE_SONNET = 'claude-sonnet-4-6'

export const CHAT_MODELS = {
  SCOUT: LLAMA_4_SCOUT,
  KIMI: KIMI_K2_6,
  CLAUDE: CLAUDE_SONNET,
} as const

// 'scout'    = Llama 4 Scout on Workers AI (cheapest, multimodal)
// 'kimi'     = Kimi K2.6 on Workers AI (closest-to-Claude voice)
// 'llama70b' = Llama 3.3 70B dense on Workers AI (operator default for chat)
// 'claude'   = Anthropic Sonnet 4.6 (premium, third-party billing)
export type ChatModelKey = 'scout' | 'kimi' | 'llama70b' | 'claude'

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
  // Workers AI Kimi K2.6: ~$0.74/M input, ~$3.50/M output
  // 4000 input + 2000 output tokens per pass = ~$0.01/pass
  free: {
    threads:           0.01,
    clip_candidates:   0.01,
    creative_elements: 0.01,
    entities:          0.01,
  },
  // Premium: Sonnet for threads + creative, Kimi for clips + entities
  premium: {
    threads:           0.042,   // 4000 input @ $3/M + 2000 output @ $15/M
    clip_candidates:   0.01,
    creative_elements: 0.042,
    entities:          0.01,
  },
  // Max: Sonnet for all 4
  max: {
    threads:           0.042,
    clip_candidates:   0.042,
    creative_elements: 0.042,
    entities:          0.042,
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

  // Workers AI path. Kimi K2.6 (OpenAI-style) and Llama (response field) both
  // route here; we extract the text from whichever shape the model returned.
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
  const rawText =
    result?.choices?.[0]?.message?.content ??
    result?.response ??
    ''
  const text = stripJsonFences(String(rawText))
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

// ─── Chat / agent surface ───────────────────────────────────────────────────
// Used by /api/v2/chat. Supports tool calls (function calling) and vision via
// either Kimi K2.6 on Workers AI (default, free-ish) or Claude Sonnet (opt-in,
// premium). Behaviour is normalized so the caller doesn't care which provider
// answered — every message arrives as { role, content[], tool_calls? }.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatImageRef {
  type: 'image_url'
  image_url: { url: string }
}

export interface ChatTextPart { type: 'text'; text: string }

export type ChatContentPart = ChatTextPart | ChatImageRef

export interface ChatMessage {
  role: ChatRole
  content: string | ChatContentPart[]
  tool_call_id?: string
  tool_calls?: ChatToolCall[]
  name?: string
}

export interface ChatToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}

export interface ChatToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ChatResponse {
  text: string
  tool_calls: ChatToolCall[]
  inputTokens: number
  outputTokens: number
  provider: 'workers_ai' | 'claude'
  model: string
  stopReason: string | null
}

/**
 * Single-turn chat completion with optional tool use + vision.
 *
 * Caller is responsible for the multi-turn tool loop (execute tool, append
 * result as role='tool', call again). This function does ONE round-trip.
 */
export async function callChat(
  env: { AI: Ai; ANTHROPIC_API_KEY: string },
  args: {
    model: ChatModelKey
    system?: string
    messages: ChatMessage[]
    tools?: ChatToolDef[]
    maxTokens?: number
    temperature?: number
  },
): Promise<ChatResponse> {
  if (args.model === 'claude') {
    return callClaudeChat(env, args)
  }
  // All three Workers AI models share the OpenAI-compatible chat path —
  // same response shape, different model id.
  const workersModel =
    args.model === 'scout' ? LLAMA_4_SCOUT :
    args.model === 'llama70b' ? LLAMA_70B :
    KIMI_K2_6
  return callWorkersAiChat(env, workersModel, args)
}

// ─── Workers AI chat (OpenAI-compatible — Kimi K2.6 + Llama 4 Scout share it) ─

async function callWorkersAiChat(
  env: { AI: Ai },
  modelId: string,
  args: {
    system?: string
    messages: ChatMessage[]
    tools?: ChatToolDef[]
    maxTokens?: number
    temperature?: number
  },
): Promise<ChatResponse> {
  const openAiMessages = toOpenAiMessages(args.system, args.messages)
  const tools = args.tools?.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  const body: any = {
    messages: openAiMessages,
    max_tokens: args.maxTokens ?? 4096,
  }
  if (args.temperature != null) body.temperature = args.temperature
  if (tools && tools.length) body.tools = tools

  const result: any = await env.AI.run(modelId as any, body)
  // Workers AI normalizes OpenAI-style responses; tool_calls live on
  // result.choices?.[0]?.message?.tool_calls when present, otherwise the model
  // returns text only.
  const choice = Array.isArray(result?.choices) ? result.choices[0] : null
  const msg = choice?.message ?? null
  const text = String(msg?.content ?? result?.response ?? '')
  const rawToolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
  const toolCalls: ChatToolCall[] = rawToolCalls.map((tc: any, i: number) => ({
    id: tc.id ?? `call_${i}`,
    name: tc.function?.name ?? tc.name ?? '',
    arguments: parseToolArgs(tc.function?.arguments ?? tc.arguments ?? '{}'),
  }))

  return {
    text,
    tool_calls: toolCalls,
    inputTokens: result?.usage?.prompt_tokens ?? 0,
    outputTokens: result?.usage?.completion_tokens ?? 0,
    provider: 'workers_ai',
    model: modelId,
    stopReason: choice?.finish_reason ?? null,
  }
}

function toOpenAiMessages(system: string | undefined, messages: ChatMessage[]): any[] {
  const out: any[] = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: stringContent(m.content), name: m.name })
      continue
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      out.push({
        role: 'assistant',
        content: stringContent(m.content) || null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      })
      continue
    }
    // user / assistant — content can be string or multimodal parts.
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content })
    } else {
      // OpenAI multimodal: [{type:'text',text}, {type:'image_url',image_url:{url}}]
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

function stringContent(content: string | ChatContentPart[]): string {
  if (typeof content === 'string') return content
  return content
    .filter((p): p is ChatTextPart => p.type === 'text')
    .map(p => p.text)
    .join('')
}

function parseToolArgs(raw: any): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null) return raw
  if (typeof raw !== 'string') return {}
  try { return JSON.parse(raw) }
  catch { return {} }
}

// ─── Claude chat (Sonnet 4.6) with tool use ─────────────────────────────────

async function callClaudeChat(
  env: { ANTHROPIC_API_KEY: string },
  args: {
    system?: string
    messages: ChatMessage[]
    tools?: ChatToolDef[]
    maxTokens?: number
    temperature?: number
  },
): Promise<ChatResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — required for max-tier chat. Set the secret on Pages or pick Kimi.')
  }

  const claudeMessages = toClaudeMessages(args.messages)
  const claudeTools = args.tools?.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))

  const body: any = {
    model: CLAUDE_SONNET,
    max_tokens: args.maxTokens ?? 4096,
    messages: claudeMessages,
  }
  if (args.system) body.system = args.system
  if (claudeTools && claudeTools.length) body.tools = claudeTools
  if (args.temperature != null) body.temperature = args.temperature

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 800)}`)
  }
  const data: any = await res.json()
  const blocks = Array.isArray(data.content) ? data.content : []
  const text = blocks
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
  const toolCalls: ChatToolCall[] = blocks
    .filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({
      id: b.id,
      name: b.name,
      arguments: typeof b.input === 'object' && b.input !== null ? b.input : {},
    }))
  return {
    text,
    tool_calls: toolCalls,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    provider: 'claude',
    model: data.model ?? CLAUDE_SONNET,
    stopReason: data.stop_reason ?? null,
  }
}

function toClaudeMessages(messages: ChatMessage[]): any[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: stringContent(m.content),
        }],
      }
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      const blocks: any[] = []
      const textPart = stringContent(m.content)
      if (textPart) blocks.push({ type: 'text', text: textPart })
      for (const tc of m.tool_calls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments })
      }
      return { role: 'assistant', content: blocks }
    }
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content }
    }
    // Multimodal — convert OpenAI-style image_url into Claude image blocks.
    const blocks = m.content.map((p): any => {
      if (p.type === 'text') return { type: 'text', text: p.text }
      // Claude accepts data:image/jpeg;base64,... via source.type='base64' OR
      // a URL via source.type='url'. We pass URL through verbatim.
      return { type: 'image', source: { type: 'url', url: p.image_url.url } }
    })
    return { role: m.role, content: blocks }
  })
}
