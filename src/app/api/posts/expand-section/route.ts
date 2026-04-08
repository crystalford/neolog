export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKey } from '@/lib/ai-provider'
import { extractOpenAIStyleUsage, logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

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
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({} as any))
    const postId = (body as any)?.postId
    const heading = (body as any)?.heading

    finalMeta = {
      user_id: session.user.id,
      post_id: typeof postId === 'string' ? postId : null,
      heading_len: typeof heading === 'string' ? heading.length : null,
    }
    try {
      const run = await startJobRun('posts.expand_section', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!postId || !heading) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'postId and heading are required' }, { status: 400 })
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, content, content_html')
      .eq('id', postId)
      .eq('author_id', session.user.id)
      .single()

    if (postError || !post) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'not_found' }
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const plain = stripHtml(post.content_html || post.content || '')
  const { data: profile } = await supabase
    .from('profiles')
    .select('context_md')
    .eq('id', post.author_id)
    .single()

    const groqKey = await resolveProviderKey(session.user.id, 'groq')
    const openaiKey = await resolveProviderKey(session.user.id, 'openai')
    let apiKey = groqKey?.key || openaiKey?.key || ''
    let capBlocked = false
    const apiUrl = groqKey
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
    const model = groqKey
      ? process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
      : MODEL

    if (apiKey) {
      try {
        await enforceUsageCaps({
          supabase,
          userId: session.user.id,
          provider: groqKey ? 'groq' : 'openai',
        })
      } catch {
        capBlocked = true
        apiKey = ''
      }
    }
    if (!apiKey) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', model: 'fallback', cap_blocked: capBlocked }
      return NextResponse.json({
        expansion: `Add more detail on "${heading}". This is a placeholder until AI is enabled.`,
        model: 'fallback',
        meta: { cap_blocked: capBlocked },
      })
    }

    const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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
      finalErrorMessage = 'Failed to expand section'
      return NextResponse.json({ error: 'Failed to expand section' }, { status: 500 })
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      finalErrorMessage = 'No expansion produced'
      return NextResponse.json({ error: 'No expansion produced' }, { status: 500 })
    }

    const usage = extractOpenAIStyleUsage(data)
    if (usage) {
      const provider = groqKey ? 'groq' : 'openai'
      await logProviderUsage({
        userId: session.user.id,
        provider,
        model,
        route: '/api/posts/expand-section',
        operation: 'chat.completions',
        usage,
      })
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', model, provider: groqKey ? 'groq' : 'openai', expansion_len: content.length }
    return NextResponse.json({ expansion: content, model })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to expand section'
    return NextResponse.json({ error: 'Failed to expand section' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
