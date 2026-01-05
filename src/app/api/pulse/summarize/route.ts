import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKey } from '@/lib/ai-provider'
import { extractOpenAIStyleUsage, logProviderUsage } from '@/lib/usage'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const fallbackSummary = (cards: any[]) => {
  const bodies = cards.map((card) => card.body).filter(Boolean)
  const summary = bodies[0] || 'Summary pending.'
  const takeaway = bodies[1] ? `Key takeaway: ${bodies[1]}` : 'Key takeaway pending.'
  return { summary, takeaway, model: 'fallback', usage: null }
}

async function getAiSummary(cards: any[], apiKey: string, context?: string | null) {
  if (!apiKey) return null
  const contextBlock = context ? `\nWriter context:\n${context}` : ''
  const sources = cards.map((card, index) => (
    `Source ${index + 1} (${card.source}, ${card.label}): ${card.body}`
  )).join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'You summarize pulse stories from social evidence. Output JSON only.',
        },
        {
          role: 'user',
          content: `Return JSON with keys summary (2 short paragraphs) and takeaway (1 sentence).${contextBlock}\n\n${sources}`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) return null
  const data = await response.json()
  const usage = extractOpenAIStyleUsage(data)
  const content = data?.choices?.[0]?.message?.content
  if (!content) return null
  try {
    const parsed = JSON.parse(content)
    const summary = String(parsed.summary || '').trim()
    const takeaway = String(parsed.takeaway || '').trim()
    if (!summary) return null
    return { summary, takeaway, model: MODEL, usage }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { cards } = await request.json()
  if (!Array.isArray(cards) || cards.length === 0) {
    return NextResponse.json({ error: 'cards are required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('context_md')
    .eq('id', session.user.id)
    .single()

  const keyResult = await resolveProviderKey(session.user.id, 'openai')
  const apiKey = keyResult?.key || ''

  let result = await getAiSummary(cards, apiKey, profile?.context_md)
  if (!result) {
    result = fallbackSummary(cards)
  }

  if ((result as any)?.usage) {
    await logProviderUsage({
      userId: session.user.id,
      provider: 'openai',
      model: MODEL,
      route: '/api/pulse/summarize',
      operation: 'chat.completions',
      usage: (result as any).usage,
    })
  }

  return NextResponse.json({
    summary: result.summary,
    takeaway: result.takeaway,
    model: result.model,
  })
}
