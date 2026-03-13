import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { resolveProviderKey } from '@/lib/ai-provider'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const entityId = params.id

    // 1. Fetch entity and its mentions
    const [
      { data: entity },
      { data: mentions },
    ] = await Promise.all([
      supabase.from('entities').select('*').eq('id', entityId).eq('user_id', userId).single(),
      supabase.from('entity_mentions').select('*').eq('entity_id', entityId).order('created_at', { ascending: true }),
    ])

    if (!entity || entity.type !== 'project') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 2. Prepare AI context
    const mentionContext = mentions?.map(m => `- [${new Date(m.created_at).toLocaleDateString()}]: ${m.context}`).join('\n') || 'No detailed mentions found.'

    const systemPrompt = `You are a professional case study writer. You are analyzing the "Signal Log" for a specific project named "${entity.name}".
    
    Raw Signals for ${entity.name}:
    ${mentionContext}
    
    GOAL: Generate a structured Case Study for this project. 
    Format your response as a JSON object with these fields:
    - summary: 1-2 sentence overview
    - challenge: What problem was being solved?
    - approach: How were they tackling it?
    - results: What was achieved or decided?
    - tags: 3-5 relevant keywords
    
    Use a professional, objective tone. Stick to the facts found in the signals.
    `

    // 3. Run AI
    const openaiKey = await resolveProviderKey(userId, 'openai')
    const anthropicKey = await resolveProviderKey(userId, 'anthropic')

    let caseStudy: any = null
    if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const msg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Generate a case study for this project. Return JSON ONLY.' }],
      })
      const textContent = msg.content.find(c => c.type === 'text')
      if (textContent && 'text' in textContent) {
        caseStudy = JSON.parse(textContent.text.replace(/```json|```/g, ''))
      }
    } else if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey })
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate a case study for this project. Return JSON ONLY.' }
        ],
        response_format: { type: 'json_object' }
      })
      caseStudy = JSON.parse(res.choices[0].message.content || '{}')
    }

    // 4. Update entity metadata
    if (caseStudy) {
      const updatedMetadata = {
        ...(entity.metadata || {}),
        case_study: caseStudy,
        last_synthesis_at: new Date().toISOString()
      }
      
      await supabase.from('entities').update({ 
        metadata: updatedMetadata,
        summary: caseStudy.summary // Sync summary for easier list viewing
      }).eq('id', entityId)
    }

    return NextResponse.json({ success: true, caseStudy })
  } catch (error) {
    console.error('Case study generation error:', error)
    return NextResponse.json({ error: 'Failed to generate case study' }, { status: 500 })
  }
}
