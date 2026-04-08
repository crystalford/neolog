export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { extractOpenAIStyleUsage, logProviderUsage } from '@/lib/usage'
import { enforceUsageCaps } from '@/lib/usageCaps'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function stripHtml(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSentences(text: string, max = 3): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  return sentences.slice(0, max)
}

function chunkText(text: string, maxLength: number): string[] {
  const chunks: string[] = []
  let remaining = text.trim()
  while (remaining.length > maxLength) {
    let sliceEnd = remaining.lastIndexOf(' ', maxLength)
    if (sliceEnd < maxLength * 0.6) {
      sliceEnd = maxLength
    }
    chunks.push(remaining.slice(0, sliceEnd).trim())
    remaining = remaining.slice(sliceEnd).trim()
  }
  if (remaining.length) {
    chunks.push(remaining)
  }
  return chunks
}

function createOgDataUrlVariant(
  title: string,
  subtitle: string | null | undefined,
  options: { width: number; height: number }
) {
  const { width, height } = options
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeSubtitle = (subtitle || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const isStory = height > width
  const scale = width / 1200
  const maxTitleLine = isStory ? 22 : width <= 1100 ? 30 : 34
  const titleLines = splitTitleLines(safeTitle, maxTitleLine)

  const brandY = isStory ? Math.round(240 * (height / 630)) : Math.round(200 * scale)
  const titleStartY = isStory ? Math.round(480 * (height / 630)) : Math.round((titleLines.length > 1 ? 270 : 300) * scale)
  const subtitleY = isStory
    ? Math.round(980 * (height / 630))
    : Math.round((titleLines.length > 1 ? 380 : 360) * scale)
  const footerY = isStory ? Math.round(1500 * (height / 630)) : Math.round(520 * scale)

  const outerPad = isStory ? Math.round(90 * scale) : Math.round(70 * scale)
  const outerW = width - outerPad * 2
  const outerH = isStory ? Math.round(height * 0.62) : Math.round(490 * scale)
  const outerY = isStory ? Math.round(height * 0.18) : Math.round(70 * scale)

  const innerPad = isStory ? Math.round(50 * scale) : Math.round(40 * scale)
  const innerX = outerPad + innerPad
  const innerY = outerY + Math.round(50 * scale)
  const innerW = width - innerX * 2
  const innerH = outerH - Math.round(90 * scale)

  const titleSize = isStory ? Math.round(64 * scale) : Math.round(58 * scale)
  const subtitleSize = Math.round(26 * scale)
  const brandSize = Math.round(28 * scale)
  const footerSize = Math.round(20 * scale)

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <rect x="${outerPad}" y="${outerY}" width="${outerW}" height="${outerH}" rx="${Math.round(32 * scale)}" fill="#0b1220" opacity="0.78"/>
  <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="${Math.round(26 * scale)}" fill="#111827" stroke="#243042" stroke-width="${Math.max(1, Math.round(1 * scale))}" opacity="0.9"/>
  <text x="${Math.round(140 * scale)}" y="${brandY}" fill="#22d3ee" font-family="Inter, Arial, sans-serif" font-size="${brandSize}" letter-spacing="${Math.max(2, Math.round(4 * scale))}">NEOLOG</text>
  <text x="${Math.round(140 * scale)}" y="${titleStartY}" fill="#f8fafc" font-family="Georgia, serif" font-size="${titleSize}" font-weight="700">
    ${titleLines
      .map((line, index) => `<tspan x="${Math.round(140 * scale)}" dy="${index === 0 ? 0 : Math.round(62 * scale)}">${line}</tspan>`)
      .join('')}
  </text>
  ${safeSubtitle ? `<text x="${Math.round(140 * scale)}" y="${subtitleY}" fill="#cbd5f5" font-family="Inter, Arial, sans-serif" font-size="${subtitleSize}">${safeSubtitle}</text>` : ''}
  <text x="${Math.round(140 * scale)}" y="${footerY}" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="${footerSize}">neolog.ai</text>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function createOgDataUrl(title: string, subtitle?: string | null) {
  return createOgDataUrlVariant(title, subtitle, { width: 1200, height: 630 })
}

function splitTitleLines(title: string, maxLineLength = 34) {
  const words = title.split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxLineLength && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  })
  if (current) lines.push(current)
  return lines.slice(0, 2)
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const authHeader = request.headers.get('authorization')
  const isCron =
    Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`

  const body = (await request.json().catch(() => null)) as
    | { postId?: string; authorId?: string }
    | null

  if (!session && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const postId = typeof body?.postId === 'string' ? body.postId : ''
  const cronAuthorId = typeof body?.authorId === 'string' ? body.authorId : ''
  const actorUserId = session?.user.id || cronAuthorId

  finalMeta = {
    is_cron: isCron,
    user_id: actorUserId || null,
    has_session: Boolean(session),
    post_id: postId || null,
  }
  try {
    const run = await startJobRun('posts.distribution_pack', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    if (!postId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    if (!session && isCron && !cronAuthorId) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_author_id' }
      return NextResponse.json({ error: 'authorId is required for cron' }, { status: 400 })
    }

    const db = session ? supabase : createAdminClient()
    if (!db) {
      finalErrorMessage = 'Server misconfigured.'
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

  const { data: post, error: postError } = await db
    .from('posts')
    .select('id, title, subtitle, slug, excerpt, content, content_html, author_id, author:profiles(username, display_name)')
    .eq('id', postId)
    .eq('author_id', actorUserId)
    .single()

  if (postError || !post) {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'not_found' }
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  finalMeta = {
    ...finalMeta,
    author_id: post.author_id,
    title_len: typeof post.title === 'string' ? post.title.length : 0,
    subtitle_len: typeof post.subtitle === 'string' ? post.subtitle.length : 0,
    excerpt_len: typeof post.excerpt === 'string' ? post.excerpt.length : 0,
    content_len: typeof post.content === 'string' ? post.content.length : 0,
    content_html_len: typeof post.content_html === 'string' ? post.content_html.length : 0,
  }

  const { data: profile } = await db
    .from('profiles')
    .select('context_md')
    .eq('id', post.author_id)
    .single()

  finalMeta = {
    ...finalMeta,
    has_writer_context: Boolean(profile?.context_md),
    writer_context_len: typeof profile?.context_md === 'string' ? profile.context_md.length : 0,
  }

  const groqKey = await resolveProviderKeyWithClient(db as any, actorUserId, 'groq')
  const openaiKey = await resolveProviderKeyWithClient(db as any, actorUserId, 'openai')
  const apiKey = groqKey?.key || openaiKey?.key || ''
  const apiUrl = groqKey
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'
  const model = groqKey
    ? process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    : MODEL

  finalMeta = {
    ...finalMeta,
    provider: groqKey ? 'groq' : openaiKey ? 'openai' : 'none',
    model,
    has_api_key: Boolean(apiKey),
  }

  const buildFallback = () => {
    const plain = stripHtml(post.content_html || post.content || '')
    const summary = post.excerpt || getSentences(plain, 2).join(' ')
    const sentenceList = getSentences(plain, 4)
    const authorProfile = Array.isArray((post as any).author)
      ? (post as any).author[0]
      : (post as any).author
    const authorUsername = authorProfile?.username || 'unknown'
    const link = `${BASE_URL}/${authorUsername}/${post.slug}`
    const mediumHtml = [
      `<p><em>Originally published at <a href="${link}">${link}</a></em></p>`,
      post.content_html || post.content || '',
    ].join('\n')
    const devtoMarkdown = [
      `> Originally published at ${link}`,
      '',
      `# ${post.title}`,
      '',
      summary,
      '',
      '## Key takeaways',
      sentenceList.map((s) => `- ${s}`).join('\n'),
      '',
      `Read more: ${link}`,
    ].join('\n')
    const newsletterSubject = post.title
    const newsletterPreview = summary.slice(0, 140)
    const newsletterBody = [
      `<h1>${post.title}</h1>`,
      post.subtitle ? `<p><em>${post.subtitle}</em></p>` : '',
      `<p>${summary}</p>`,
      `<ul>${sentenceList.map((s) => `<li>${s}</li>`).join('')}</ul>`,
      `<p><a href="${link}">Read the full post</a></p>`,
    ].filter(Boolean).join('\n')

    const hooks = [
      `Most people miss this in "${post.title}":`,
      `The 60-second version of ${post.title}.`,
      `The part of ${post.title} worth saving.`,
      `What shifted my view on ${post.title}:`,
      `A quick, clean breakdown of ${post.title}.`,
    ]

    const threadBody = chunkText(`${hooks[0]} ${summary}`, 260)
    const shortThread = chunkText(`${hooks[0]} ${summary}`, 280).join('\n\n')
    return {
      x_thread: [...threadBody, `Full post: ${link}`],
      threads_post: shortThread,
      bluesky_post: shortThread.slice(0, 280),
      linkedin_post: [
        post.title,
        '',
        summary,
        '',
        'Key takeaways:',
        sentenceList.slice(0, 3).map((s) => `- ${s}`).join('\n'),
        '',
        `Read more: ${link}`,
      ].filter(Boolean).join('\n'),
      reddit_title: post.title,
      reddit_body: [
        `**TL;DR:** ${summary}`,
        '',
        sentenceList.map((s) => `- ${s}`).join('\n'),
        '',
        `Source: ${link}`,
      ].join('\n'),
      hooks,
      medium_html: mediumHtml,
      devto_markdown: devtoMarkdown,
      newsletter_subject: newsletterSubject,
      newsletter_preview: newsletterPreview,
      newsletter_body: newsletterBody,
      model: 'fallback',
      link,
    }
  }

  const buildAiPack = async () => {
    if (!apiKey) return null

    // If caps block AI, return null and let fallback handle it.
    let capBlocked = false

    try {
      await enforceUsageCaps({
        supabase: db as any,
        userId: actorUserId,
        provider: groqKey ? 'groq' : 'openai',
      })
    } catch {
      capBlocked = true
      return null
    }

    const plain = stripHtml(post.content_html || post.content || '')
    const authorProfile = Array.isArray((post as any).author)
      ? (post as any).author[0]
      : (post as any).author
    const authorUsername = authorProfile?.username || 'unknown'
    const link = `${BASE_URL}/${authorUsername}/${post.slug}`

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
          content: 'You create distribution copy. Follow the writer context when provided. Output JSON only.',
        },
        {
          role: 'user',
          content: [
            'Return JSON with keys: x_thread (array of 4-6 tweets), threads_post (string), bluesky_post (string), linkedin_post (string), reddit_title, reddit_body, hooks (array of 5), medium_html (string), devto_markdown (string), newsletter_subject (string), newsletter_preview (string), newsletter_body (string).',
            'X thread: start with a strong hook, keep each tweet under 260 chars, end with the link.',
            'LinkedIn: 1-sentence hook, 2-3 bullet takeaways, short CTA with link.',
            'Reddit: neutral tone, include TL;DR + bullets + link.',
            'Threads/Bluesky: a short 1-2 paragraph post with the link on a new line.',
            'Medium HTML: include an opening line that links back to the canonical URL.',
            'Dev.to Markdown: include a short summary, bullet takeaways, and the link.',
            'Newsletter: subject <= 70 chars, preview <= 140 chars, body in HTML with title, short intro, bullets, and link.',
            profile?.context_md ? `Writer context:\n${profile.context_md}` : '',
            `Post title: ${post.title}`,
            `Subtitle: ${post.subtitle || ''}`,
            `Excerpt: ${post.excerpt || ''}`,
            `Content: ${plain.slice(0, 4000)}`,
            `Link: ${link}`,
          ].filter(Boolean).join('\n'),
        },
      ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) return null
    const data = await response.json()

    const usage = extractOpenAIStyleUsage(data)
    if (usage) {
      const provider = groqKey ? 'groq' : 'openai'
      await logProviderUsage({
        userId: actorUserId,
        provider,
        model,
        route: '/api/posts/distribution-pack',
        operation: 'chat.completions',
        usage,
      })
    }

    const content = data?.choices?.[0]?.message?.content
    if (!content) return null
    try {
      const parsed = JSON.parse(content)
      return {
        x_thread: Array.isArray(parsed.x_thread) ? parsed.x_thread : [],
        threads_post: String(parsed.threads_post || ''),
        bluesky_post: String(parsed.bluesky_post || ''),
        linkedin_post: String(parsed.linkedin_post || ''),
        reddit_title: String(parsed.reddit_title || post.title),
        reddit_body: String(parsed.reddit_body || ''),
        hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
        medium_html: String(parsed.medium_html || ''),
        devto_markdown: String(parsed.devto_markdown || ''),
        newsletter_subject: String(parsed.newsletter_subject || ''),
        newsletter_preview: String(parsed.newsletter_preview || ''),
        newsletter_body: String(parsed.newsletter_body || ''),
        model,
        link,
        cap_blocked: capBlocked,
      }
    } catch {
      return null
    }
  }

  try {
    const aiPack = await buildAiPack()
    const fallback = buildFallback()
    const pack = aiPack && aiPack.x_thread.length > 0 ? aiPack : fallback
    const og_image_url = createOgDataUrl(post.title, post.subtitle)
    const og_square_url = createOgDataUrlVariant(post.title, post.subtitle, { width: 1080, height: 1080 })
    const og_story_url = createOgDataUrlVariant(post.title, post.subtitle, { width: 1080, height: 1920 })

    const payload = {
      post_id: post.id,
      author_id: post.author_id,
      status: 'ready',
      x_thread: pack.x_thread,
      threads_post: pack.threads_post || '',
      bluesky_post: pack.bluesky_post || '',
      linkedin_post: pack.linkedin_post,
      reddit_title: pack.reddit_title,
      reddit_body: pack.reddit_body,
      hooks: pack.hooks,
      og_image_url,
      og_square_url,
      og_story_url,
      medium_html: pack.medium_html || '',
      devto_markdown: pack.devto_markdown || '',
      newsletter_subject: pack.newsletter_subject || '',
      newsletter_preview: pack.newsletter_preview || '',
      newsletter_body: pack.newsletter_body || '',
      model: pack.model,
      error_message: null,
    }

    await supabase
      .from('post_distribution_packs')
      .upsert(payload, { onConflict: 'post_id' })

    const capBlocked = Boolean((aiPack as any)?.cap_blocked) && (!aiPack || aiPack.x_thread.length === 0)

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      result: 'success',
      used_ai: Boolean(aiPack && aiPack.x_thread.length > 0),
      cap_blocked: capBlocked,
      x_thread_count: Array.isArray(pack.x_thread) ? pack.x_thread.length : 0,
      hooks_count: Array.isArray(pack.hooks) ? pack.hooks.length : 0,
    }
    return NextResponse.json({ pack: payload, meta: { cap_blocked: capBlocked } })
  } catch (error: any) {
    const message = error?.message || 'Failed to generate distribution pack'
    finalErrorMessage = message
    await supabase
      .from('post_distribution_packs')
      .upsert({
        post_id: post.id,
        author_id: post.author_id,
        status: 'error',
        error_message: message,
      }, { onConflict: 'post_id' })

    return NextResponse.json({ error: message }, { status: 500 })
  }
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
