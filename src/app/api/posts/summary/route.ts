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

function getSentences(text: string, max = 4): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, max)
}

function getFallbackSummary(text: string) {
  const sentences = getSentences(text, 4)
  return {
    summary: sentences.slice(0, 2).join(' '),
    bullets: sentences.slice(0, 4),
    model: 'fallback',
    usage: null,
  }
}

async function getAiSummary(
  text: string,
  apiKey: string,
  context: string | null | undefined,
  apiUrl: string,
  model: string
) {
  if (!apiKey) return null

  const contextBlock = context ? `\nWriter context:\n${context}` : ''

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'Summarize posts for a reader. Follow the writer context when provided. Output JSON only.',
        },
        {
          role: 'user',
          content: `Return JSON with keys summary (1-2 sentences) and bullets (3-5 short bullets).${contextBlock}\n\nText:\n${text}`,
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
    return { summary, bullets, model, usage: extractOpenAIStyleUsage(data) }
  } catch {
    return null
  }
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

    finalMeta = { user_id: session.user.id, post_id: typeof postId === 'string' ? postId : null }
    try {
      const run = await startJobRun('posts.summary', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!postId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, title, excerpt, content, content_html')
      .eq('id', postId)
      .eq('author_id', session.user.id)
      .single()

    if (postError || !post) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'not_found' }
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const plain = stripHtml(post.content_html || post.content || '')
    const base = plain || post.excerpt || post.title
    finalMeta = { ...finalMeta, base_len: typeof base === 'string' ? base.length : null }

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
      const fallback = getFallbackSummary(base)
      const payload = {
        post_id: post.id,
        author_id: post.author_id,
        summary: fallback.summary,
        bullets: fallback.bullets,
        model: fallback.model,
      }

      await supabase
        .from('post_summaries')
        .upsert(payload, { onConflict: 'post_id' })

      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', model: 'fallback', cap_blocked: capBlocked }
      return NextResponse.json({ summary: payload, meta: { cap_blocked: capBlocked } })
    }

    let result = await getAiSummary(base, apiKey, profile?.context_md, apiUrl, model)
    if (!result) {
      result = getFallbackSummary(base)
    }

    if ((result as any)?.usage) {
      const provider = groqKey ? 'groq' : 'openai'
      await logProviderUsage({
        userId: session.user.id,
        provider,
        model,
        route: '/api/posts/summary',
        operation: 'chat.completions',
        usage: (result as any).usage,
        metadata: { fallback: false },
      })
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

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      result: 'success',
      model: result.model,
      provider: groqKey ? 'groq' : 'openai',
      cap_blocked: capBlocked,
      used_ai: Boolean((result as any)?.usage),
      bullets_count: Array.isArray(result.bullets) ? result.bullets.length : null,
      summary_len: typeof result.summary === 'string' ? result.summary.length : null,
    }
    return NextResponse.json({ summary: payload, meta: { cap_blocked: capBlocked } })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to summarize post'
    return NextResponse.json({ error: 'Failed to summarize post' }, { status: 500 })
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
