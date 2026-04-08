export const runtime = 'edge'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

/**
 * Webmention Verification
 * 
 * This endpoint verifies pending webmentions by:
 * 1. Fetching the source URL
 * 2. Checking if it contains a link to the target
 * 3. Extracting author info and content
 * 4. Updating the webmention as verified
 * 
 * Call this from a cron job or queue worker
 */

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      finalStatus = 'success'
      finalMeta = { result: 'unauthorized' }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    finalMeta = { batch_limit: 50 }
    try {
      const run = await startJobRun('webmention.verify', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    // Get unverified webmentions
    const { data: pending } = await supabase
      .from('webmentions')
      .select('*')
      .eq('verified', false)
      .limit(50)

    if (!pending || pending.length === 0) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'success', processed: 0, verified: 0, failed: 0 }
      return NextResponse.json({ message: 'No pending webmentions', processed: 0 })
    }

    let verified = 0
    let failed = 0

    for (const mention of pending) {
      try {
        // Fetch source URL
        const response = await fetch(mention.source_url, {
          headers: {
            'User-Agent': 'Neolog Webmention Verifier/1.0',
          },
        })

        if (!response.ok) {
          // Source URL not accessible, delete the webmention
          await supabase
            .from('webmentions')
            .delete()
            .eq('id', mention.id)
          failed++
          continue
        }

        const html = await response.text()

        // Check if source links to target
        if (!html.includes(mention.target_url)) {
          // No link found, delete the webmention
          await supabase
            .from('webmentions')
            .delete()
            .eq('id', mention.id)
          failed++
          continue
        }

        // Try to extract metadata
        const metadata = extractMetadata(html, mention.source_url)

        // Determine mention type
        const mentionType = determineMentionType(html, mention.target_url)

        // Update as verified with extracted data
        await supabase
          .from('webmentions')
          .update({
            verified: true,
            mention_type: mentionType,
            author_name: metadata.authorName,
            author_url: metadata.authorUrl,
            author_avatar: metadata.authorAvatar,
            content: metadata.content,
            published_at: metadata.publishedAt,
          })
          .eq('id', mention.id)

        verified++
      } catch (error) {
        console.error(`Error verifying webmention ${mention.id}:`, error)
        failed++
      }
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', processed: pending.length, verified, failed }

    return NextResponse.json({
      message: 'Verification complete',
      processed: pending.length,
      verified,
      failed,
    })
  } catch (error) {
    console.error('Webmention verification error:', error)
    finalErrorMessage = (error as any)?.message || 'Internal error'
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
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

/**
 * Extract metadata from HTML using simple regex patterns
 * In production, use a proper HTML parser like cheerio
 */
function extractMetadata(html: string, sourceUrl: string) {
  let authorName: string | null = null
  let authorUrl: string | null = null
  let authorAvatar: string | null = null
  let content: string | null = null
  let publishedAt: string | null = null

  // Try to extract author name from common patterns
  const authorPatterns = [
    /<meta[^>]*name="author"[^>]*content="([^"]+)"/i,
    /<a[^>]*class="[^"]*p-author[^"]*"[^>]*>([^<]+)/i,
    /<span[^>]*class="[^"]*p-author[^"]*"[^>]*>([^<]+)/i,
    /"author":\s*{\s*"name":\s*"([^"]+)"/i,
  ]

  for (const pattern of authorPatterns) {
    const match = html.match(pattern)
    if (match) {
      authorName = match[1].trim()
      break
    }
  }

  // Try to extract published date
  const datePatterns = [
    /<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i,
    /<time[^>]*datetime="([^"]+)"/i,
    /"datePublished":\s*"([^"]+)"/i,
  ]

  for (const pattern of datePatterns) {
    const match = html.match(pattern)
    if (match) {
      publishedAt = match[1]
      break
    }
  }

  // Try to extract content/description
  const contentPatterns = [
    /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
    /<p[^>]*class="[^"]*p-summary[^"]*"[^>]*>([^<]+)/i,
  ]

  for (const pattern of contentPatterns) {
    const match = html.match(pattern)
    if (match) {
      content = match[1].trim().substring(0, 500)
      break
    }
  }

  // Try to extract author avatar
  const avatarPatterns = [
    /<img[^>]*class="[^"]*u-photo[^"]*"[^>]*src="([^"]+)"/i,
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
  ]

  for (const pattern of avatarPatterns) {
    const match = html.match(pattern)
    if (match) {
      authorAvatar = match[1]
      break
    }
  }

  // Use domain as fallback author URL
  try {
    const url = new URL(sourceUrl)
    authorUrl = url.origin
  } catch {}

  return {
    authorName,
    authorUrl,
    authorAvatar,
    content,
    publishedAt,
  }
}

/**
 * Determine the type of webmention based on content
 */
function determineMentionType(html: string, targetUrl: string): string {
  const lowerHtml = html.toLowerCase()

  // Check for like indicators
  if (
    lowerHtml.includes('class="u-like-of"') ||
    lowerHtml.includes('class="h-like"') ||
    lowerHtml.includes('liked this')
  ) {
    return 'like'
  }

  // Check for repost indicators
  if (
    lowerHtml.includes('class="u-repost-of"') ||
    lowerHtml.includes('class="h-repost"') ||
    lowerHtml.includes('reposted') ||
    lowerHtml.includes('shared this')
  ) {
    return 'repost'
  }

  // Check for reply indicators
  if (
    lowerHtml.includes('class="u-in-reply-to"') ||
    lowerHtml.includes('in reply to')
  ) {
    return 'reply'
  }

  // Check for bookmark
  if (
    lowerHtml.includes('class="u-bookmark-of"') ||
    lowerHtml.includes('bookmarked')
  ) {
    return 'bookmark'
  }

  // Default to mention
  return 'mention'
}
