import { createAdminClient } from '@/lib/supabase/admin'

export type OpenAIStyleUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export type ProviderUsageEvent = {
  userId: string
  provider: 'openai' | 'groq' | string
  model?: string | null
  route?: string | null
  operation?: string | null
  usage?: OpenAIStyleUsage | null
  metadata?: Record<string, unknown>
}

export function extractOpenAIStyleUsage(data: any): OpenAIStyleUsage | null {
  const usage = data?.usage
  if (!usage || typeof usage !== 'object') return null

  const prompt = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined
  const completion = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined
  const total = typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined

  if (prompt === undefined && completion === undefined && total === undefined) return null
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total }
}

export async function logProviderUsage(event: ProviderUsageEvent): Promise<void> {
  try {
    const admin = createAdminClient()
    if (!admin) return

    const payload = {
      user_id: event.userId,
      provider: event.provider,
      model: event.model ?? null,
      route: event.route ?? null,
      operation: event.operation ?? null,
      prompt_tokens: event.usage?.prompt_tokens ?? null,
      completion_tokens: event.usage?.completion_tokens ?? null,
      total_tokens: event.usage?.total_tokens ?? null,
      metadata: event.metadata ?? {},
    }

    await admin.from('provider_usage').insert(payload)
  } catch {
    // best-effort logging only
  }
}
