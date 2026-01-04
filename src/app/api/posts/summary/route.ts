import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function stripHtml(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSentences(text: string, max = 4): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, max)
}

function getFallbackSummary(text: string) {
  const sentences = getSentences(text, 4)
  return {
    summary: sentences.slice(0, 2).join(' '),
    bullets: sentences.slice(0, 4),
    model: 'fallback',
  }
}

async function getAiSummary(text: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

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
          content: 'Summarize posts for a reader. Output JSON only.',
        },
        {
          role: 'user',
          content: `Return JSON with keys summary (1-2 sentences) and bullets (3-5 short bullets). Text:\n${text}`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) return null

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) return null

  try {
    const parsed = JSON.parse(content)
    const summary = String(parsed.summary || '').trim()
    const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.map((b: any) => String(b).trim()).filter(Boolean) : []
    if (!summary || bullets.length === 0) return null
    return { summary, bullets, model: MODEL }
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

  const { postId } = await request.json()
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, author_id, title, excerpt, content, content_html')
    .eq('id', postId)
    .eq('author_id', session.user.id)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const plain = stripHtml(post.content_html || post.content || '')
  const base = plain || post.excerpt || post.title

  let result = await getAiSummary(base)
  if (!result) {
    result = getFallbackSummary(base)
  }

  const payload = {
    post_id: post.id,
    author_id: post.author_id,
    summary: result.summary,
    bullets: result.bullets,
    model: result.model,
  }

  await supabase
    .from('post_summaries')
    .upsert(payload, { onConflict: 'post_id' })

  return NextResponse.json({ summary: payload })
}
