import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

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

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="80" y="80" width="1040" height="470" rx="28" fill="#111827" opacity="0.65"/>
  <text x="140" y="200" fill="#22d3ee" font-family="Inter, Arial, sans-serif" font-size="28" letter-spacing="4">NEOLOG</text>
  <text x="140" y="280" fill="#f8fafc" font-family="Georgia, serif" font-size="58" font-weight="700">${safeTitle}</text>
  <text x="140" y="360" fill="#cbd5f5" font-family="Inter, Arial, sans-serif" font-size="28">${safeSubtitle}</text>
  <text x="140" y="520" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="20">neolog.ai</text>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
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

  try {
    const plain = stripHtml(post.content_html || post.content || '')
    const summary = post.excerpt || getSentences(plain, 2).join(' ')
    const sentenceList = getSentences(plain, 4)
    const authorProfile = Array.isArray((post as any).author)
      ? (post as any).author[0]
      : (post as any).author
    const authorUsername = authorProfile?.username || 'unknown'
    const link = `${BASE_URL}/${authorUsername}/${post.slug}`

    const hooks = [
      `The hidden point in "${post.title}" most people miss:`,
      `If you only read one thing today, make it this.`,
      `A quick breakdown of ${post.title}.`,
      `Here's the 60-second version of ${post.title}.`,
      `What changed my mind about ${post.title}:`,
    ]

    const threadBody = chunkText(summary, 260)
    const x_thread = [
      ...threadBody,
      `Full post: ${link}`,
    ]

    const linkedin_post = [
      post.title,
      '',
      summary,
      '',
      sentenceList.slice(0, 3).map((s) => `- ${s}`).join('\n'),
      '',
      `Read more: ${link}`,
    ].filter(Boolean).join('\n')

    const reddit_title = post.title
    const reddit_body = [
      `**TL;DR:** ${summary}`,
      '',
      sentenceList.map((s) => `- ${s}`).join('\n'),
      '',
      `Source: ${link}`,
    ].join('\n')

    const og_image_url = createOgDataUrl(post.title, post.subtitle)

    const payload = {
      post_id: post.id,
      author_id: post.author_id,
      status: 'ready',
      x_thread,
      linkedin_post,
      reddit_title,
      reddit_body,
      hooks,
      og_image_url,
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
