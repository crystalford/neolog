import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import OpenAI from 'openai'

export const runtime = 'edge'

export async function POST() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user_id = session.user.id

  // 1. Fetch the latest synthesis and profile
  const [
    { data: synthesis },
    { data: profile },
    openaiKey
  ] = await Promise.all([
    supabase
      .from('user_synthesis')
      .select('*')
      .eq('user_id', user_id)
      .order('synthesized_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', user_id)
      .single(),
    resolveProviderKeyWithClient(supabase, user_id, 'openai')
  ])

  if (!synthesis) {
    return NextResponse.json({ error: 'Please run synthesis first from the Intelligence tab.' }, { status: 422 })
  }

  if (!openaiKey) {
    return NextResponse.json({ error: 'No AI API key configured in Settings.' }, { status: 422 })
  }

  // 2. Format the bio using LLM
  const openai = new OpenAI({ apiKey: openaiKey.key })

  const systemPrompt = `You are a professional narrative biographer. You write "Living Bios" — rich, first-person narratives that capture a person's current trajectory, energy, and focus. You don't sound like a resume; you sound like an honest, insightful through-line of someone's current life chapter.`

  const userPrompt = `Write a first-person bio for ${profile?.display_name || profile?.username || 'this user'}.
  
  CURRENT CHAPTER (SPINE): ${synthesis.spine}
  
  ACTIVE NARRATIVES:
  ${(synthesis.narratives as any[]).map(n => `- ${n.title}: ${n.description}`).join('\n')}
  
  RECURRING THEMES:
  ${(synthesis.themes as any[]).map(t => `- ${t.theme}`).join(', ')}
  
  MOMENTUM:
  - Accelerating: ${((synthesis.momentum as any)?.accelerating || []).join(', ')}
  
  Write 2-3 paragraphs. Be descriptive, soulful, and grounded in the data. Don't use corporate buzzwords. Avoid the word "passionate."`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7
  })

  const bio = response.choices[0].message.content

  if (!bio) {
    return NextResponse.json({ error: 'Failed to generate bio' }, { status: 500 })
  }

  // 3. Update the profile
  await supabase
    .from('profiles')
    .update({ bio, updated_at: new Date().toISOString() })
    .eq('id', user_id)

  return NextResponse.json({ bio })
}
