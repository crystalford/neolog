import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function extractYouTubeChannelId(html: string): string | null {
  const candidates: Array<RegExp> = [
    /"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{18,})"/,
    /channelId\\\":\\\"(UC[a-zA-Z0-9_-]{18,})\\\"/,
    /<meta\s+itemprop="channelId"\s+content="(UC[a-zA-Z0-9_-]{18,})"\s*\/>/i,
    /<meta\s+itemprop="channelId"\s+content="(UC[a-zA-Z0-9_-]{18,})"\s*>/i,
    /<link\s+rel="canonical"\s+href="https?:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{18,})"/i,
    /<link\s+href="https?:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{18,})"\s+rel="canonical"/i,
  ]

  for (const re of candidates) {
    const match = html.match(re)
    if (match?.[1]) return match[1]
  }

  return null
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { network?: string; url?: string }
    | null

  const network = typeof body?.network === 'string' ? body.network : ''
  const url = typeof body?.url === 'string' ? body.url.trim() : ''

  if (!network || !url) {
    return NextResponse.json({ error: 'network and url are required.' }, { status: 400 })
  }

  if (network !== 'youtube') {
    return NextResponse.json({ error: 'Unsupported network.' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'URL must start with http or https.' }, { status: 400 })
  }

  const hostname = parsed.hostname.toLowerCase()
  const allowed = hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'm.youtube.com'
  if (!allowed) {
    return NextResponse.json({ error: 'Please use a youtube.com URL.' }, { status: 400 })
  }

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'neolog-sources/1.0',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      // Keep caching conservative; this may be user-specific
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ error: `YouTube request failed (${response.status}).` }, { status: 502 })
    }

    const html = await response.text()
    const channelId = extractYouTubeChannelId(html)
    if (!channelId) {
      return NextResponse.json(
        {
          error:
            'Could not resolve channel id. Try a URL that contains /channel/UC... (or open the channel page and copy its URL).',
        },
        { status: 422 },
      )
    }

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    return NextResponse.json({ channelId, feedUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to resolve YouTube feed.' }, { status: 500 })
  }
}
