import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

// Generate Open Graph social card image for a post
// GET /api/social-cards?postId=xxx

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')
    const title = searchParams.get('title')
    const author = searchParams.get('author')

    finalMeta = {
      has_post_id: Boolean(postId),
      title_len: typeof title === 'string' ? title.length : null,
      author_len: typeof author === 'string' ? author.length : null,
    }
    try {
      const run = await startJobRun('social_cards.render', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!postId && !title) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'postId or title required' }, { status: 400 })
    }

    let postTitle = title
    let authorName = author

    // If postId provided, fetch post details
    if (postId) {
      const supabase = createClient()
      const { data: post } = await supabase
        .from('posts')
        .select('title, author:profiles(display_name, username)')
        .eq('id', postId)
        .single()

      if (post && post.author) {
        postTitle = post.title
        // Handle author as either array or object
        const authorData = Array.isArray(post.author) ? post.author[0] : post.author
        authorName = authorData?.display_name || authorData?.username
      }
    }

    // Generate SVG social card
    const svg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0f0f0f;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1a1a1a;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#ff6b35;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#ff8c61;stop-opacity:1" />
          </linearGradient>
        </defs>

        <!-- Background -->
        <rect width="1200" height="630" fill="url(#bg)"/>

        <!-- Grid pattern -->
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" stroke-opacity="0.02" stroke-width="1"/>
        </pattern>
        <rect width="1200" height="630" fill="url(#grid)"/>

        <!-- Gradient orb -->
        <circle cx="900" cy="150" r="300" fill="url(#accent)" opacity="0.1" filter="blur(60px)"/>

        <!-- Logo -->
        <text x="80" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="white">
          N
        </text>
        <text x="120" y="90" font-family="Georgia, serif" font-size="32" font-weight="400" fill="white">
          neolog
        </text>

        <!-- Title -->
        <foreignObject x="80" y="180" width="1040" height="300">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Georgia, serif; font-size: 64px; font-weight: 700; color: white; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
            ${escapeHtml(postTitle || 'Untitled Post')}
          </div>
        </foreignObject>

        <!-- Author -->
        ${authorName ? `
          <text x="80" y="550" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="#999">
            by ${escapeHtml(authorName)}
          </text>
        ` : ''}

        <!-- Accent line -->
        <rect x="80" y="500" width="120" height="4" fill="url(#accent)" rx="2"/>
      </svg>
    `

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', used_post_lookup: Boolean(postId) }

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Social card error:', error)
    finalErrorMessage = (error as any)?.message || 'Internal server error'
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}
