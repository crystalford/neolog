import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKey } from '@/lib/ai-provider'
import { extractOpenAIStyleUsage, logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const fallbackSentiment = (label?: string) => {
  if (label === 'Critic') return 'negative'
  if (label === 'Hype') return 'positive'
  return 'neutral'
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
  let apiKey = keyResult?.key || ''
  let capBlocked = false

  if (apiKey) {
    try {
      await enforceUsageCaps({ supabase, userId: session.user.id, provider: 'openai' })
    } catch {
      capBlocked = true
      apiKey = ''
    }
  }

  if (!apiKey) {
    return NextResponse.json({
      sentiments: cards.map((card: any) => fallbackSentiment(card?.label)),
      model: 'fallback',
      meta: { cap_blocked: capBlocked },
    })
  }

  const contextBlock = profile?.context_md ? `\nWriter context:\n${profile.context_md}` : ''
  const sourceText = cards.map((card: any, index: number) => (
    `Card ${index + 1}: ${card.body}`
  )).join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Classify each card sentiment as positive, negative, or neutral. Output JSON only.',
        },
        {
          role: 'user',
          content: `Return JSON with key sentiments as an array in order.${contextBlock}\n\n${sourceText}`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    return NextResponse.json({
      sentiments: cards.map((card: any) => fallbackSentiment(card?.label)),
      model: 'fallback',
    })
  }

  const data = await response.json()
  const usage = extractOpenAIStyleUsage(data)
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    return NextResponse.json({
      sentiments: cards.map((card: any) => fallbackSentiment(card?.label)),
      model: 'fallback',
    })
  }

  try {
    const parsed = JSON.parse(content)
    const sentiments = Array.isArray(parsed.sentiments)
      ? parsed.sentiments.map((value: any) => {
          if (value === 'positive' || value === 'negative') return value
          return 'neutral'
        })
      : cards.map((card: any) => fallbackSentiment(card?.label))

    if (usage) {
      await logProviderUsage({
        userId: session.user.id,
        provider: 'openai',
        model: MODEL,
        route: '/api/pulse/sentiment',
        operation: 'chat.completions',
        usage,
      })
    }

    return NextResponse.json({ sentiments, model: MODEL })
  } catch {
    return NextResponse.json({
      sentiments: cards.map((card: any) => fallbackSentiment(card?.label)),
      model: 'fallback',
      meta: { cap_blocked: capBlocked },
    })
  }
}
