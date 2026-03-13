import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { resolveProviderKey } from '@/lib/ai-provider'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // 1. Gather intelligence data
    // Fetch all logs and entity mentions to build a full picture
    const [
      { data: profile },
      { data: logs },
      { data: entities },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('log_entries').select('title, body, meta').eq('user_id', userId).order('logged_at', { ascending: false }).limit(50),
      supabase.from('entities').select('*').eq('user_id', userId).order('mention_count', { ascending: false }).limit(30),
    ])

    const name = profile?.display_name || profile?.username || 'the user'

    // 2. Prepare AI context
    const logContext = logs?.map(l => `- ${l.title}: ${l.body?.substring(0, 100)}...`).join('\n') || 'No logs found.'
    const entityContext = entities?.map(e => `- ${e.name} (${e.type}): ${e.mention_count} mentions`).join('\n') || 'No entities found.'

    const systemPrompt = `You are a professional narrative architect for Neolog. Your job is to synthesize a user's life and work into a compelling, evidence-based "Living Bio".
    
    User context:
    Name: ${name}
    
    Raw Signals (Recent Logs):
    ${logContext}
    
    Extracted Entities:
    ${entityContext}
    
    GOAL: Write a 2-3 paragraph professional bio that captures ${name}'s current focus, projects, and trajectory. Be specific. Use the data provided. Don't use generic fluff. Make it sound like an intelligence report summary but written for a high-end portfolio.
    
    IDENTITY: Refer to ${name} in the third person. Keep it professional but modern.
    `

    // 3. Run AI
    const openaiKey = await resolveProviderKey(userId, 'openai')
    const anthropicKey = await resolveProviderKey(userId, 'anthropic')

    let bio = ''
    if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const msg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Generate my living bio based on my signals.' }],
      })
      const textContent = msg.content.find(c => c.type === 'text')
      if (textContent && 'text' in textContent) bio = textContent.text
    } else if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey })
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate my living bio based on my signals.' }
        ],
      })
      bio = res.choices[0].message.content || ''
    } else {
      return NextResponse.json({ error: 'No AI keys configured' }, { status: 400 })
    }

    // 4. Save to profile
    if (bio) {
      await supabase.from('profiles').update({ bio }).eq('id', userId)
    }

    return NextResponse.json({ success: true, bio })
  } catch (error) {
    console.error('Portfolio generation error:', error)
    return NextResponse.json({ error: 'Failed to generate portfolio' }, { status: 500 })
  }
}
