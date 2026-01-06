import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

// Generate feeds for all Neolog posts (firehose)
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const format = request.nextUrl.searchParams.get('format') || 'rss'

  finalMeta = { format }
  try {
    const run = await startJobRun('feeds.global', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {

  // Get recent published posts with author info
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles(*)
    `)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(100)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://neolog.ai'
  const feedUrl = `${baseUrl}/api/feeds/global`

  if (format === 'json') {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', response: 'json' }
    return generateJSONFeed(posts || [], baseUrl, feedUrl)
  } else if (format === 'atom') {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', response: 'atom' }
    return generateAtomFeed(posts || [], baseUrl, feedUrl)
  } else {
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', response: 'rss' }
    return generateRSSFeed(posts || [], baseUrl, feedUrl)
  }
  } catch (error: any) {
    finalErrorMessage = error?.message || 'Failed to generate feed'
    return new Response('Failed to generate feed', { status: 500 })
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

function generateRSSFeed(posts: any[], baseUrl: string, feedUrl: string) {
  const escapeXml = (str: string) => 
    str?.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&apos;') || ''

  const items = posts.map(post => {
    const postUrl = `${baseUrl}/${post.author.username}/${post.slug}`
    const pubDate = new Date(post.published_at).toUTCString()
    const authorName = post.author.display_name || post.author.username
    
    return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${post.excerpt || post.subtitle || ''}]]></description>
      <author>${escapeXml(authorName)}</author>
      <source url="${baseUrl}/${post.author.username}/feed">${escapeXml(authorName)}</source>
    </item>`
  }).join('\n')

  const lastBuildDate = posts.length > 0 
    ? new Date(posts[0].published_at).toUTCString()
    : new Date().toUTCString()

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:source="http://source.scripting.com/">
  <channel>
    <title>Neolog - All Posts</title>
    <link>${baseUrl}</link>
    <description>The latest posts from Neolog, the publishing platform that respects your code.</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <atom:link href="${feedUrl}?format=atom" rel="alternate" type="application/atom+xml"/>
    <atom:link href="${feedUrl}?format=json" rel="alternate" type="application/json"/>
    ${items}
  </channel>
</rss>`

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  })
}

function generateAtomFeed(posts: any[], baseUrl: string, feedUrl: string) {
  const escapeXml = (str: string) => 
    str?.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&apos;') || ''

  const entries = posts.map(post => {
    const postUrl = `${baseUrl}/${post.author.username}/${post.slug}`
    const authorUrl = `${baseUrl}/${post.author.username}`
    const published = new Date(post.published_at).toISOString()
    const updated = new Date(post.updated_at).toISOString()
    const authorName = post.author.display_name || post.author.username
    
    return `
  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${postUrl}" rel="alternate" type="text/html"/>
    <id>${postUrl}</id>
    <published>${published}</published>
    <updated>${updated}</updated>
    <summary>${escapeXml(post.excerpt || post.subtitle || '')}</summary>
    <author>
      <name>${escapeXml(authorName)}</name>
      <uri>${authorUrl}</uri>
    </author>
  </entry>`
  }).join('\n')

  const updated = posts.length > 0 
    ? new Date(posts[0].published_at).toISOString()
    : new Date().toISOString()

  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Neolog - All Posts</title>
  <subtitle>The latest posts from Neolog, the publishing platform that respects your code.</subtitle>
  <link href="${baseUrl}" rel="alternate" type="text/html"/>
  <link href="${feedUrl}?format=atom" rel="self" type="application/atom+xml"/>
  <link href="${feedUrl}" rel="alternate" type="application/rss+xml"/>
  <link href="${feedUrl}?format=json" rel="alternate" type="application/json"/>
  <id>${baseUrl}</id>
  <updated>${updated}</updated>
  ${entries}
</feed>`

  return new Response(atom, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  })
}

function generateJSONFeed(posts: any[], baseUrl: string, feedUrl: string) {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Neolog - All Posts',
    home_page_url: baseUrl,
    feed_url: `${feedUrl}?format=json`,
    description: 'The latest posts from Neolog, the publishing platform that respects your code.',
    items: posts.map(post => {
      const authorName = post.author.display_name || post.author.username
      return {
        id: `${baseUrl}/${post.author.username}/${post.slug}`,
        url: `${baseUrl}/${post.author.username}/${post.slug}`,
        title: post.title,
        summary: post.excerpt || post.subtitle,
        date_published: new Date(post.published_at).toISOString(),
        date_modified: new Date(post.updated_at).toISOString(),
        authors: [
          {
            name: authorName,
            url: `${baseUrl}/${post.author.username}`,
            avatar: post.author.avatar_url,
          }
        ],
      }
    }),
  }

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  })
}
