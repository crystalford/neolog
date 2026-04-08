export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// Generate RSS 2.0 feed for a user
export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const supabase = createClient()
  const { username } = params
  const format = request.nextUrl.searchParams.get('format') || 'rss'

  // Get publication
  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, description, logo_url, owner_id, is_active')
    .eq('slug', username)
    .maybeSingle()

  if (!publication || !publication.is_active) {
    return new Response('Publication not found', { status: 404 })
  }

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .eq('id', publication.owner_id)
    .maybeSingle()

  // Get published posts
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('publication_id', publication.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://neolog.ai'
  const feedUrl = `${baseUrl}/${username}/feed`
  const profileUrl = `${baseUrl}/${publication.slug}`

  // Return appropriate format
  if (format === 'json') {
    return generateJSONFeed(publication, ownerProfile, posts || [], baseUrl, feedUrl, profileUrl)
  } else if (format === 'atom') {
    return generateAtomFeed(publication, ownerProfile, posts || [], baseUrl, feedUrl, profileUrl)
  } else {
    return generateRSSFeed(publication, ownerProfile, posts || [], baseUrl, feedUrl, profileUrl)
  }
}

function generateRSSFeed(
  publication: any,
  ownerProfile: any,
  posts: any[],
  baseUrl: string,
  feedUrl: string,
  profileUrl: string
) {
  const escapeXml = (str: string) => 
    str?.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&apos;') || ''

  const items = posts.map(post => {
    const postUrl = `${baseUrl}/${publication.slug}/${post.slug}`
    const pubDate = new Date(post.published_at).toUTCString()
    
    return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${post.excerpt || post.subtitle || ''}]]></description>
      ${post.content_html ? `<content:encoded><![CDATA[${post.content_html}]]></content:encoded>` : ''}
      <author>${escapeXml(publication.name)}</author>
    </item>`
  }).join('\n')

  const lastBuildDate = posts.length > 0 
    ? new Date(posts[0].published_at).toUTCString()
    : new Date().toUTCString()

  // WebSub hub for real-time push notifications
  const websubHub = process.env.WEBSUB_HUB_URL || 'https://pubsubhubbub.appspot.com'

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(publication.name)} on Neolog</title>
    <link>${profileUrl}</link>
    <description>${escapeXml(publication.description || `Posts by ${publication.name}`)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <atom:link href="${websubHub}" rel="hub"/>
    <atom:link href="${feedUrl}?format=atom" rel="alternate" type="application/atom+xml"/>
    <atom:link href="${feedUrl}?format=json" rel="alternate" type="application/json"/>
    ${items}
  </channel>
</rss>`

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}

function generateAtomFeed(
  publication: any,
  ownerProfile: any,
  posts: any[],
  baseUrl: string,
  feedUrl: string,
  profileUrl: string
) {
  const escapeXml = (str: string) => 
    str?.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&apos;') || ''

  const entries = posts.map(post => {
    const postUrl = `${baseUrl}/${publication.slug}/${post.slug}`
    const published = new Date(post.published_at).toISOString()
    const updated = new Date(post.updated_at).toISOString()
    
    return `
  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${postUrl}" rel="alternate" type="text/html"/>
    <id>${postUrl}</id>
    <published>${published}</published>
    <updated>${updated}</updated>
    <summary>${escapeXml(post.excerpt || post.subtitle || '')}</summary>
    ${post.content_html ? `<content type="html"><![CDATA[${post.content_html}]]></content>` : ''}
    <author>
      <name>${escapeXml(publication.name)}</name>
      <uri>${profileUrl}</uri>
    </author>
  </entry>`
  }).join('\n')

  const updated = posts.length > 0 
    ? new Date(posts[0].published_at).toISOString()
    : new Date().toISOString()

  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(publication.name)} on Neolog</title>
  <subtitle>${escapeXml(publication.description || `Posts by ${publication.name}`)}</subtitle>
  <link href="${profileUrl}" rel="alternate" type="text/html"/>
  <link href="${feedUrl}?format=atom" rel="self" type="application/atom+xml"/>
  <link href="${feedUrl}" rel="alternate" type="application/rss+xml"/>
  <link href="${feedUrl}?format=json" rel="alternate" type="application/json"/>
  <id>${profileUrl}</id>
  <updated>${updated}</updated>
  <author>
    <name>${escapeXml(publication.name)}</name>
    <uri>${profileUrl}</uri>
  </author>
  ${entries}
</feed>`

  return new Response(atom, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}

function generateJSONFeed(
  publication: any,
  ownerProfile: any,
  posts: any[],
  baseUrl: string,
  feedUrl: string,
  profileUrl: string
) {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${publication.name} on Neolog`,
    home_page_url: profileUrl,
    feed_url: `${feedUrl}?format=json`,
    description: publication.description || `Posts by ${publication.name}`,
    authors: [
      {
        name: publication.name,
        url: profileUrl,
        avatar: publication.logo_url || ownerProfile?.avatar_url || null,
      }
    ],
    items: posts.map(post => ({
      id: `${baseUrl}/${publication.slug}/${post.slug}`,
      url: `${baseUrl}/${publication.slug}/${post.slug}`,
      title: post.title,
      content_html: post.content_html || post.content,
      summary: post.excerpt || post.subtitle,
      date_published: new Date(post.published_at).toISOString(),
      date_modified: new Date(post.updated_at).toISOString(),
      authors: [
        {
          name: publication.name,
          url: profileUrl,
        }
      ],
      tags: [], // Could add tags here
    })),
  }

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
