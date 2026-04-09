import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import OpenAI from 'openai'

export const runtime = 'edge'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content, instructions } = await request.json()

  if (!content) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }

  const openaiKey = await resolveProviderKeyWithClient(supabase, session.user.id, 'openai')
  if (!openaiKey) {
    return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 422 })
  }

  const openai = new OpenAI({ apiKey: openaiKey.key })

  const systemPrompt = `You are a social media expert specializing in X (formerly Twitter). 
Your goal is to take raw thoughts, insights, or transcript excerpts and turn them into high-engagement, "punched up" X posts.
- Keep it under 280 characters.
- Use a tone that is high-agency, insightful, and slightly provocative if appropriate.
- Avoid hashtags and emojis unless specifically requested.
- Focus on clarity and narrative "hooks".`

  const userPrompt = `Refine this post:
  
  CONTENT: "${content}"
  
  ${instructions ? `USER INSTRUCTIONS: ${instructions}` : 'Just make it punchier and more native to X.'}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8
    })

    const refinedContent = response.choices[0].message.content
    return NextResponse.json({ refinedContent })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
