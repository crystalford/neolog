import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type DiscoveredFeed = {
  url: string
  type: string | null
  title: string | null
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function absolutizeUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return maybeRelative
  }
}

function extractAlternateLinks(html: string, baseUrl: string): DiscoveredFeed[] {
  // Intentionally simple: look for <link ... rel="alternate" ... href="..." ...>
  // and capture type/title when present.
  const results: DiscoveredFeed[] = []
  const linkTags = html.match(/<link\b[^>]*>/gi) || []

  for (const tag of linkTags) {
    const relMatch = tag.match(/\brel\s*=\s*(["'])(.*?)\1/i)
    const rel = relMatch?.[2] || ''
    if (!rel.toLowerCase().split(/\s+/).includes('alternate')) continue

    const hrefMatch = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)
    const href = hrefMatch?.[2] || ''
    if (!href) continue

    const typeMatch = tag.match(/\btype\s*=\s*(["'])(.*?)\1/i)
    const titleMatch = tag.match(/\btitle\s*=\s*(["'])(.*?)\1/i)

    const absolute = absolutizeUrl(baseUrl, href)
    results.push({
      url: absolute,
      type: typeMatch?.[2] || null,
      title: titleMatch?.[2] || null,
    })
  }

  return results
}

async function looksLikeFeedUrl(url: string): Promise<{ ok: boolean; contentType: string | null }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'neolog-sources/1.0',
        accept: 'application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
      },
      cache: 'no-store',
    })
    const contentType = res.headers.get('content-type')
    if (!res.ok) return { ok: false, contentType }

    const text = await res.text()
    const trimmed = text.trimStart()
    const ct = (contentType || '').toLowerCase()

    const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[') || ct.includes('application/feed+json') || ct.includes('application/json')
    const looksXml = trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed') || ct.includes('xml') || ct.includes('rss') || ct.includes('atom')

    return { ok: looksJson || looksXml, contentType }
  } catch {
    return { ok: false, contentType: null }
  }
}

function candidateFeedUrlsFromPageUrl(pageUrl: string): string[] {
  try {
    const url = new URL(pageUrl)
    const origin = url.origin
    const common = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/atom.xml', '/feed.json', '/index.xml']
    return common.map((path) => `${origin}${path}`)
  } catch {
    return []
  }
}

function rankFeed(feed: DiscoveredFeed): number {
  const type = (feed.type || '').toLowerCase()
  if (type.includes('application/feed+json') || type.includes('json')) return 0
  if (type.includes('application/atom+xml') || type.includes('atom')) return 1
  if (type.includes('application/rss+xml') || type.includes('rss')) return 2
  return 3
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { url?: string } | null
  const url = typeof body?.url === 'string' ? body.url.trim() : ''

  if (!url) {
    return NextResponse.json({ error: 'url is required.' }, { status: 400 })
  }

  if (!isHttpUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 })
  }

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'neolog-sources/1.0',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Request failed (${response.status}).` }, { status: 502 })
    }

    const html = await response.text()

    const feeds = extractAlternateLinks(html, response.url || url)
      .filter((f) => isHttpUrl(f.url))
      .sort((a, b) => {
        const ra = rankFeed(a)
        const rb = rankFeed(b)
        if (ra !== rb) return ra - rb
        return a.url.localeCompare(b.url)
      })

    // Fallback discovery: try common feed endpoints when alternate links aren't present.
    if (feeds.length === 0) {
      const candidates = candidateFeedUrlsFromPageUrl(response.url || url)
      const discovered: DiscoveredFeed[] = []
      for (const candidate of candidates) {
        // stop early if we find enough
        if (discovered.length >= 5) break
        const check = await looksLikeFeedUrl(candidate)
        if (!check.ok) continue
        discovered.push({ url: candidate, type: check.contentType, title: null })
      }

      if (discovered.length === 0) {
        return NextResponse.json(
          {
            error:
              'No feed link found on that page. Try pasting the site’s RSS/Atom/JSON Feed URL directly (often /feed, /rss, /atom.xml, /feed.json).',
          },
          { status: 404 },
        )
      }

      const sorted = discovered.sort((a, b) => {
        const ra = rankFeed(a)
        const rb = rankFeed(b)
        if (ra !== rb) return ra - rb
        return a.url.localeCompare(b.url)
      })

      return NextResponse.json({ feeds: sorted, best: sorted[0] })
    }

    return NextResponse.json({ feeds, best: feeds[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to discover feeds.' }, { status: 500 })
  }
}
