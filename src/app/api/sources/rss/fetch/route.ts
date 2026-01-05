import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRss } from '@/lib/rss/parse'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : null

  let query = supabase
    .from('feed_sources')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('source_type', 'rss')
    .eq('is_active', true)

  if (sourceId) {
    query = query.eq('id', sourceId)
  }

  const { data: sources, error: sourceError } = await query
  if (sourceError) {
    return NextResponse.json({ error: 'Failed to load sources.' }, { status: 500 })
  }

  const itemsToInsert: any[] = []

  for (const source of sources || []) {
    try {
      const response = await fetch(source.url, {
        redirect: 'follow',
        headers: {
          'user-agent': 'neolog-rss/1.0',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      })
      if (!response.ok) continue
      const xml = await response.text()
      const items = parseRss(xml)
      const links = items.map((item) => item.link).filter(Boolean)

      const { data: existingRows } = await supabase
        .from('inbox_items')
        .select('canonical_url')
        .eq('user_id', session.user.id)
        .in('canonical_url', links)

      const existing = new Set((existingRows || []).map((row) => row.canonical_url))

      items.forEach((item) => {
        if (!item.link || existing.has(item.link)) return
        itemsToInsert.push({
          user_id: session.user.id,
          source_type: 'rss',
          source_url: source.url,
          title: item.title || 'Untitled',
          canonical_url: item.link,
          published_at: item.published_at ? new Date(item.published_at).toISOString() : null,
          raw_data: {
            title: item.title,
            link: item.link,
            content_html: item.content,
            published_at: item.published_at,
          },
        })
      })

      await supabase
        .from('feed_sources')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', source.id)
    } catch (error) {
      console.error('RSS fetch error:', error)
    }
  }

  if (itemsToInsert.length > 0) {
    // Best-effort insert: bulk first, then fall back to per-row if needed.
    const { error } = await supabase.from('inbox_items').insert(itemsToInsert)
    if (error) {
      let inserted = 0
      for (const row of itemsToInsert) {
        const { error: rowError } = await supabase.from('inbox_items').insert(row)
        if (!rowError) inserted += 1
      }
      return NextResponse.json({ inserted })
    }
  }

  return NextResponse.json({ inserted: itemsToInsert.length })
}
