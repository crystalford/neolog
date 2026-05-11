/**
 * Anthropic Claude client — Workers-runtime friendly.
 *
 * Uses fetch directly against the Messages API (no SDK to keep the Worker
 * bundle small). Loads the prompt from D1 by name + is_active=1 so prompt
 * iteration doesn't require redeployment.
 *
 * The Anthropic API key is a Worker secret: env.ANTHROPIC_API_KEY.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { findOne } from './d1'

export interface ClaudeEnv {
  ANTHROPIC_API_KEY: string
  DB: D1Database
}

export interface PromptRecord {
  id: string
  name: string
  version: string
  body: string
  model: string
  is_active: number
}

/**
 * Load the active version of a named prompt.
 */
export async function loadPrompt(db: D1Database, name: string): Promise<PromptRecord> {
  const row = await findOne<PromptRecord>(
    db,
    'SELECT id, name, version, body, model, is_active FROM prompts WHERE name = ? AND is_active = 1 LIMIT 1',
    name,
  )
  if (!row) {
    throw new Error(`No active prompt found for name='${name}'. Apply db/seed.sql.`)
  }
  return row
}

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeResponse {
  text: string
  inputTokens: number
  outputTokens: number
  stopReason: string | null
  model: string
}

/**
 * Call Claude Messages API. Returns the concatenated text content.
 *
 * For JSON-returning prompts, pass `expectJson: true` and we'll add a
 * "Reply with valid JSON only" suffix to the user message + strip any
 * accidental ```json fences from the response.
 */
export async function callClaude(
  env: { ANTHROPIC_API_KEY: string },
  args: {
    model: string
    system?: string
    messages: ClaudeMessage[]
    maxTokens?: number
    expectJson?: boolean
  },
): Promise<ClaudeResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set on env. Run: wrangler pages secret put ANTHROPIC_API_KEY')
  }

  const messages = args.expectJson
    ? args.messages.map((m, i) =>
        i === args.messages.length - 1 && m.role === 'user'
          ? { ...m, content: m.content + '\n\nReturn ONLY valid JSON. No prose, no markdown fences.' }
          : m,
      )
    : args.messages

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxTokens ?? 4096,
      system: args.system,
      messages,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 800)}`)
  }

  const body: any = await res.json()
  const text = Array.isArray(body.content)
    ? body.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    : ''

  return {
    text: stripJsonFences(text),
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    stopReason: body.stop_reason ?? null,
    model: body.model ?? args.model,
  }
}

function stripJsonFences(text: string): string {
  const t = text.trim()
  if (t.startsWith('```json')) return t.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  if (t.startsWith('```')) return t.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  return t
}

/**
 * Parse a Claude response that's expected to be JSON. Throws on malformed.
 */
export function parseClaudeJson<T = unknown>(text: string): T {
  try {
    return JSON.parse(text)
  } catch (err: any) {
    throw new Error(`Claude returned malformed JSON: ${err.message}\nFirst 400 chars: ${text.slice(0, 400)}`)
  }
}
