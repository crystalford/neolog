import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProviderKey } from '@/lib/ai-provider'

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

function createOgDataUrl(title: string, subtitle?: string | null) {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeSubtitle = (subtitle || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const titleLines = splitTitleLines(safeTitle)
  const titleY = titleLines.length > 1 ? 270 : 300
  const subtitleY = titleLines.length > 1 ? 380 : 360

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
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
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="70" y="70" width="1060" height="490" rx="32" fill="#0b1220" opacity="0.78"/>
  <rect x="110" y="120" width="980" height="400" rx="26" fill="#111827" stroke="#243042" stroke-width="1" opacity="0.9"/>
  <text x="140" y="200" fill="#22d3ee" font-family="Inter, Arial, sans-serif" font-size="28" letter-spacing="4">NEOLOG</text>
  <text x="140" y="${titleY}" fill="#f8fafc" font-family="Georgia, serif" font-size="58" font-weight="700">
    ${titleLines.map((line, index) => `<tspan x="140" dy="${index === 0 ? 0 : 62}">${line}</tspan>`).join('')}
  </text>
  ${safeSubtitle ? `<text x="140" y="${subtitleY}" fill="#cbd5f5" font-family="Inter, Arial, sans-serif" font-size="26">${safeSubtitle}</text>` : ''}
  <text x="140" y="520" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="20">neolog.ai</text>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function splitTitleLines(title: string) {
  const words = title.split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length > 34 && current) {
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
    .select('id, title, subtitle, slug, excerpt, content, content_html, author_id, author:profiles(username, display_name)')
    .eq('id', postId)
    .eq('author_id', session.user.id)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('context_md')
    .eq('id', post.author_id)
    .single()

  const groqKey = await resolveProviderKey(session.user.id, 'groq')
  const openaiKey = await resolveProviderKey(session.user.id, 'openai')
  const apiKey = groqKey?.key || openaiKey?.key || ''
  const apiUrl = groqKey
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'
  const model = groqKey
    ? process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    : MODEL

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
        sentenceList.slice(0, 3).map((s) => `• ${s}`).join('\n'),
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
      model: 'fallback',
      link,
    }
  }

  const buildAiPack = async () => {
    if (!apiKey) return null
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
            'Return JSON with keys: x_thread (array of 4-6 tweets), threads_post (string), bluesky_post (string), linkedin_post (string), reddit_title, reddit_body, hooks (array of 5), medium_html (string), devto_markdown (string).',
            'X thread: start with a strong hook, keep each tweet under 260 chars, end with the link.',
            'LinkedIn: 1-sentence hook, 2-3 bullet takeaways, short CTA with link.',
            'Reddit: neutral tone, include TL;DR + bullets + link.',
            'Threads/Bluesky: a short 1-2 paragraph post with the link on a new line.',
            'Medium HTML: include an opening line that links back to the canonical URL.',
            'Dev.to Markdown: include a short summary, bullet takeaways, and the link.',
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
        model,
        link,
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
      medium_html: pack.medium_html || '',
      devto_markdown: pack.devto_markdown || '',
      model: pack.model,
      error_message: null,
    }

    await supabase
      .from('post_distribution_packs')
      .upsert(payload, { onConflict: 'post_id' })

    return NextResponse.json({ pack: payload })
  } catch (error: any) {
    const message = error?.message || 'Failed to generate distribution pack'
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
}
