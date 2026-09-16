/**
 * Anthropic Claude client — Workers-runtime friendly.
 *
 * Uses fetch directly against the Messages API (no SDK to keep the Worker
 * bundle small). The Anthropic API key is a Worker secret:
 * env.ANTHROPIC_API_KEY.
 *
 * ⚠️ Nothing calls this, on purpose. Anthropic is a paid opt-in the operator
 * has not taken, and wiring it is a deliberate act — "no branch reaches it"
 * is what "nothing currently calls it" should mean.
 *
 * `loadPrompt` used to live here and read the active row out of `prompts`,
 * a table dropped on 8 Sep with the rest of the extraction engine. Its four
 * seeded prompts — the analytical pass, the clip pass, the creative pass and
 * the entity pass — were the generator, and `db/seed.sql` was still being
 * applied by the bootstrap workflow on every deploy. Both are gone. A prompt
 * library coming back means a generator came back with it.
 */

export interface ClaudeEnv {
  ANTHROPIC_API_KEY: string
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
