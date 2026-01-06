import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKey } from '@/lib/ai-provider'
import { extractOpenAIStyleUsage, logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const buildFallback = (title: string, excerpt: string) =>
  `Today’s brief: ${title}. ${excerpt || 'Summarize the key points and why they matter.'}`

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
    const postId = typeof (body as any).postId === 'string' ? (body as any).postId : ''
    const provider = (body as any).provider === 'synthesia' ? 'synthesia' : 'heygen'

    finalMeta = { user_id: session.user.id, post_id: postId || null, provider }
    try {
      const run = await startJobRun('video.brief.create', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!postId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'postId is required.' }, { status: 400 })
    }

  const { data: post } = await supabase
    .from('posts')
    .select('id, author_id, title, excerpt, content, content_html')
    .eq('id', postId)
    .eq('author_id', session.user.id)
    .maybeSingle()

    if (!post) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'not_found' }
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }

  const { data: profile } = await supabase
    .from('profiles')
    .select('context_md')
    .eq('id', post.author_id)
    .maybeSingle()

  const groqKey = await resolveProviderKey(session.user.id, 'groq')
  const openaiKey = await resolveProviderKey(session.user.id, 'openai')
  const apiKey = groqKey?.key || openaiKey?.key || ''
  const apiUrl = groqKey
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'
  const model = groqKey
    ? process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    : OPENAI_MODEL

  let script = buildFallback(post.title, post.excerpt || '')
  let capBlocked = false

  if (apiKey) {
    try {
      await enforceUsageCaps({
        supabase,
        userId: session.user.id,
        provider: groqKey ? 'groq' : 'openai',
      })

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          messages: [
            {
              role: 'system',
              content: 'Write a 60-90 second video script. Be clear, concise, and factual.',
            },
            {
              role: 'user',
              content: [
                profile?.context_md ? `Writer context:\n${profile.context_md}` : '',
                `Title: ${post.title}`,
                `Excerpt: ${post.excerpt || ''}`,
                `Content: ${(post.content_html || post.content || '').slice(0, 3000)}`,
              ].filter(Boolean).join('\n'),
            },
          ],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const usage = extractOpenAIStyleUsage(data)
        const content = data?.choices?.[0]?.message?.content?.trim()
        if (content) {
          script = content
        }

        if (usage) {
          const providerName = groqKey ? 'groq' : 'openai'
          await logProviderUsage({
            userId: session.user.id,
            provider: providerName,
            model,
            route: '/api/video/brief',
            operation: 'chat.completions',
            usage,
            metadata: { video_provider: provider },
          })
        }
      }
    } catch {
      // fallback stays
      capBlocked = true
    }
  }

  const payload = {
    post_id: post.id,
    author_id: post.author_id,
    provider,
    script,
    status: 'queued',
    provider_payload: null,
    provider_response: null,
    error_message: null,
  }

  const { data: brief, error } = await supabase
    .from('video_briefs')
    .insert(payload)
    .select()
    .single()

  if (error) {
    finalErrorMessage = 'Failed to create video brief.'
    return NextResponse.json({ error: 'Failed to create video brief.' }, { status: 500 })
  }

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      result: 'success',
      brief_id: brief?.id || null,
      cap_blocked: capBlocked,
      script_len: typeof script === 'string' ? script.length : null,
    }
    return NextResponse.json({ brief, meta: { cap_blocked: capBlocked } })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to create video brief.'
    return NextResponse.json({ error: 'Failed to create video brief.' }, { status: 500 })
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
