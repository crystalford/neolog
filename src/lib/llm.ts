/**
 * The vision call, and nothing else.
 *
 * `callChat` sends one round-trip to Llama 4 Scout on Workers AI. It has
 * exactly two callers, and both ask the same kind of question — *what is
 * visibly on this image?*
 *
 *   `src/lib/vision.ts`     the description off a photo
 *   `src/lib/log-intake.ts` the hold-back check (SPEC §0.2) and the words
 *                           out of a picture that is really text
 *
 * There is no `model` argument. One model, one job: a picker would be a
 * choice nothing in the product is in a position to make, and every value
 * it could take other than Scout was unreachable for months before this
 * file was cut back.
 *
 * ── What this file used to route ─────────────────────────────────────────
 *
 * Three tiers (`free` / `premium` / `max`) over four extraction passes
 * (`threads`, `clip_candidates`, `creative_elements`, `entities`), costed
 * per vlog, routing the voice-sensitive passes to Claude Sonnet over
 * `api.anthropic.com` and the rest to Kimi K2.6. All four passes went with
 * the video-essay studio on 8 Sep; the routing outlived them by a session.
 * Nothing selected Kimi, Llama-70B or the Claude branch — both live callers
 * passed `'scout'` — so the tiers, the cost tables, `callLlm`,
 * `parseLlmJson` and the whole Anthropic chat path are deleted rather than
 * kept warm.
 *
 * `src/lib/anthropic.ts` stays, uncalled and on purpose: Anthropic is a
 * paid opt-in the operator has not taken. Wiring it up is a deliberate act
 * with a reason written next to it, which is why no branch here reaches it.
 *
 * **Do not add a model to this file without a caller and a reason.** The
 * three places a model runs in this product are listed in CLAUDE.md, and a
 * fourth needs to be argued for, not slipped in behind a parameter.
 */

import type { Ai } from '@cloudflare/workers-types'

/** Llama 4 Scout — natively multimodal, MoE 17B active, 131K context. */
export const VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'

// ─── The shape of a call ────────────────────────────────────────────────────

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
  model: string
  stopReason: string | null
}

/**
 * One round-trip to the vision model, with optional tool use.
 *
 * The caller owns any multi-turn tool loop (execute the tool, append the
 * result as `role: 'tool'`, call again). This function does ONE round-trip
 * and normalizes the reply.
 */
export async function callChat(
  env: { AI: Ai },
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

  const result: any = await env.AI.run(VISION_MODEL as any, body)
  // Workers AI normalizes OpenAI-style responses; tool_calls live on
  // result.choices?.[0]?.message?.tool_calls when present, otherwise the
  // model returns text only.
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
    model: VISION_MODEL,
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
    // user / assistant — content is a string or OpenAI multimodal parts,
    // and both go through unchanged.
    out.push({ role: m.role, content: m.content })
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
