import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRss } from '@/lib/rss/parse'

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { feedUrl?: string } | null
  const feedUrl = typeof body?.feedUrl === 'string' ? body.feedUrl.trim() : ''

  if (!feedUrl) {
    return NextResponse.json({ error: 'feedUrl is required.' }, { status: 400 })
  }

  if (!isHttpUrl(feedUrl)) {
    return NextResponse.json({ error: 'feedUrl must be a valid http(s) URL.' }, { status: 400 })
  }

  try {
    const res = await fetch(feedUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'neolog-rss-test/1.0',
        accept: 'application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Failed to fetch feed (${res.status}). ${text.slice(0, 200)}` },
        { status: 400 },
      )
    }

    const bodyText = await res.text()
    const items = parseRss(bodyText)
      .filter((item) => item?.title && item?.link)
      .slice(0, 3)
      .map((item) => ({
        title: item.title,
        link: item.link,
        published_at: item.published_at || null,
      }))

    return NextResponse.json({
      ok: true,
      items,
      fetchedUrl: res.url || feedUrl,
      contentType: res.headers.get('content-type'),
      parsedCount: items.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to test feed.' }, { status: 500 })
  }
}
