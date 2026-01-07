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
        'user-agent': 'neolog-rss-verify/1.0',
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

    const text = await res.text()
    const items = parseRss(text).filter((i) => i?.title && i?.link)
    const newest = items[0]
    if (!newest) {
      return NextResponse.json({ error: 'No items found in this feed.' }, { status: 404 })
    }

    const canonicalUrl = String(newest.link || '').trim()
    if (!canonicalUrl) {
      return NextResponse.json({ error: 'Feed item missing link.' }, { status: 422 })
    }

    // De-dupe against existing inbox items
    const { data: existing } = await supabase
      .from('inbox_items')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('canonical_url', canonicalUrl)
      .maybeSingle()

    if (existing?.id) {
      return NextResponse.json({ ok: true, inboxItemId: existing.id, deduped: true })
    }

    const { data, error } = await supabase
      .from('inbox_items')
      .insert({
        user_id: session.user.id,
        source_type: 'rss',
        source_url: feedUrl,
        title: newest.title || 'Untitled',
        canonical_url: canonicalUrl,
        published_at: newest.published_at ? new Date(newest.published_at).toISOString() : null,
        raw_data: {
          title: newest.title,
          link: canonicalUrl,
          content_html: newest.content || null,
          published_at: newest.published_at || null,
        },
        status: 'new',
      })
      .select('id')
      .single()

    if (error || !data?.id) {
      return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, inboxItemId: data.id, deduped: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to verify feed.' }, { status: 500 })
  }
}
