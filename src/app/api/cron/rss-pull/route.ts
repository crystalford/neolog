import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { parseRss } from '@/lib/rss/parse'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: sources, error } = await supabase
    .from('feed_sources')
    .select('id, user_id, url')
    .eq('source_type', 'rss')
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: 'Failed to load sources.' }, { status: 500 })
  }

  let inserted = 0

  for (const source of sources || []) {
    try {
      const response = await fetch(source.url)
      if (!response.ok) continue

      const xml = await response.text()
      const items = parseRss(xml)
      const links = items.map((item) => item.link).filter(Boolean)

      if (links.length === 0) continue

      const { data: existingRows } = await supabase
        .from('inbox_items')
        .select('canonical_url')
        .eq('user_id', source.user_id)
        .in('canonical_url', links)

      const existing = new Set((existingRows || []).map((row: any) => row.canonical_url))

      const itemsToInsert = items
        .filter((item) => item.link && !existing.has(item.link))
        .slice(0, 30)
        .map((item) => ({
          user_id: source.user_id,
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
        }))

      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('inbox_items').insert(itemsToInsert)
        if (!insertError) inserted += itemsToInsert.length
      }

      await supabase
        .from('feed_sources')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', source.id)
    } catch (e) {
      console.error('RSS cron error:', e)
    }
  }

  return NextResponse.json({ inserted })
}
