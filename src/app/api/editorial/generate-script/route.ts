export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { topic_title, angle, hook, required_elements } = await req.json()

  if (!topic_title) {
    return NextResponse.json({ error: 'Topic title is required' }, { status: 400 })
  }

  // Get user profile for voice fingerprint
  const { data: profile } = await supabase
    .from('profiles')
    .select('voice_profile, display_name')
    .eq('id', session.user.id)
    .single()

  const openaiKey = await resolveProviderKeyWithClient(supabase, session.user.id, 'openai')
  const anthropicKey = await resolveProviderKeyWithClient(supabase, session.user.id, 'anthropic')

  if (!openaiKey && !anthropicKey) {
    return NextResponse.json({ error: 'No AI API key configured' }, { status: 422 })
  }

  const voiceProfile = profile?.voice_profile as any
  const voiceContext = voiceProfile ? `
  USER VOICE FINGERPRINT:
  - Style: ${voiceProfile.voice_summary || 'Casual, intellectual'}
  - Signature Phrases: ${voiceProfile.signature_phrases?.join(', ') || 'N/A'}
  - Tone: ${voiceProfile.tone || 'Analytical'}
  ` : 'Style: Casual, intellectual, analytical.'

  const systemPrompt = `You are a world-class Video Essay Scriptwriter. You specialize in taking raw intellectual concepts and turning them into provocative, cinematic, and deeply engaging scripts.
  
  You must write in the SPECIFIC VOICE of the user provided in the context.
  Use their signature phrases. Match their analytical depth.
  
  The script should be formatted for a 10-15 minute video essay.
  Include:
  - [OPENING CLIP]: Provocative hook.
  - [NARRATIVE ARC]: Developing the thesis.
  - [THE PEAK]: The most profound insight.
  - [OUTRO]: Call to intellectual action.
  
  NEVER be generic. Be punchy, intellectual, and slightly subversive.`

  const userPrompt = `Draft a full video essay script for the following topic:
  
  TOPIC: ${topic_title}
  HOOK: ${hook}
  ANGLE: ${angle}
  REQUIRED ELEMENTS: ${required_elements?.join(', ')}
  
  ${voiceContext}
  
  Write the full script now. Start with the hook.`

  let script: string

  if (anthropicKey) {
    const anthropic = new Anthropic({ apiKey: anthropicKey.key })
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    script = response.content[0].type === 'text' ? response.content[0].text : ''
  } else {
    const openai = new OpenAI({ apiKey: openaiKey!.key })
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    script = response.choices[0].message.content || ''
  }

  return NextResponse.json({ script })
}
