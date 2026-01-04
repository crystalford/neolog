import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIntegrationKey } from '@/lib/integrations'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function stripHtml(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId, heading } = await request.json()
  if (!postId || !heading) {
    return NextResponse.json({ error: 'postId and heading are required' }, { status: 400 })
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, author_id, content, content_html')
    .eq('id', postId)
    .eq('author_id', session.user.id)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const plain = stripHtml(post.content_html || post.content || '')
  const { data: profile } = await supabase
    .from('profiles')
    .select('context_md')
    .eq('id', post.author_id)
    .single()

  const apiKey = (await getIntegrationKey(session.user.id, 'openai')) || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      expansion: `Add more detail on "${heading}". This is a placeholder until AI is enabled.`,
      model: 'fallback',
    })
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: 'Write a concise expansion paragraph. Avoid hallucinations. Follow the writer context when provided.',
        },
        {
          role: 'user',
          content: [
            `Expand on the section heading: ${heading}`,
            'Return 2-3 sentences max.',
            profile?.context_md ? `Writer context:\n${profile.context_md}` : '',
            `Post context:\n${plain.slice(0, 3000)}`,
          ].filter(Boolean).join('\n'),
        },
      ],
    }),
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to expand section' }, { status: 500 })
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) {
    return NextResponse.json({ error: 'No expansion produced' }, { status: 500 })
  }

  return NextResponse.json({ expansion: content, model: MODEL })
}
