import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RssItem = {
  title: string
  link: string
  published_at?: string | null
  content?: string | null
}

const stripCdata = (value: string) =>
  value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const getTag = (block: string, tag: string) => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = block.match(regex)
  if (!match) return ''
  return decodeEntities(stripCdata(match[1]))
}

const parseRss = (xml: string): RssItem[] => {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || []
  const entries = itemBlocks.map((block) => {
    const title = getTag(block, 'title')
    const link = getTag(block, 'link')
    const pubDate = getTag(block, 'pubDate')
    const content = getTag(block, 'content:encoded') || getTag(block, 'description')
    return { title, link, published_at: pubDate || null, content }
  })

  if (entries.length > 0) return entries

  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || []
  return entryBlocks.map((block) => {
    const title = getTag(block, 'title')
    const link =
      block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ||
      getTag(block, 'link')
    const pubDate = getTag(block, 'published') || getTag(block, 'updated')
    const content = getTag(block, 'content') || getTag(block, 'summary')
    return { title, link, published_at: pubDate || null, content }
  })
}

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
      const response = await fetch(source.url)
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
    await supabase.from('inbox_items').insert(itemsToInsert)
  }

  return NextResponse.json({ inserted: itemsToInsert.length })
}
