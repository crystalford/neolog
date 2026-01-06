import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRss } from '@/lib/rss/parse'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let itemsParsed = 0
  let itemsPrepared = 0
  let sourcesFetched = 0
  let sourcesFetchOk = 0
  let sourcesFetchFail = 0
  let bulkInsertAttempted = false
  let bulkInsertFailed = false
  let fallbackInserted = 0

  try {
    const body = await request.json().catch(() => ({}))
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId : null

    finalMeta = { user_id: session.user.id, source_id: sourceId, provided_source_id: Boolean(sourceId) }
    try {
      const run = await startJobRun('sources.rss.fetch', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

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
      finalErrorMessage = 'Failed to load sources.'
      return NextResponse.json({ error: 'Failed to load sources.' }, { status: 500 })
    }

    const itemsToInsert: any[] = []

    for (const source of sources || []) {
      sourcesFetched += 1
      try {
        const response = await fetch(source.url, {
          redirect: 'follow',
          headers: {
            'user-agent': 'neolog-rss/1.0',
            accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          },
        })
        if (!response.ok) {
          sourcesFetchFail += 1
          continue
        }
        sourcesFetchOk += 1

        const xml = await response.text()
        const items = parseRss(xml)
        itemsParsed += items.length
        const links = items.map((item) => item.link).filter(Boolean)

        const { data: existingRows } = await supabase
          .from('inbox_items')
          .select('canonical_url')
          .eq('user_id', session.user.id)
          .in('canonical_url', links)

        const existing = new Set((existingRows || []).map((row) => row.canonical_url))

        items.forEach((item) => {
          if (!item.link || existing.has(item.link)) return
          itemsPrepared += 1
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
        sourcesFetchFail += 1
        console.error('RSS fetch error:', error)
      }
    }

    if (itemsToInsert.length > 0) {
      // Best-effort insert: bulk first, then fall back to per-row if needed.
      bulkInsertAttempted = true
      const { error } = await supabase.from('inbox_items').insert(itemsToInsert)
      if (error) {
        bulkInsertFailed = true
        for (const row of itemsToInsert) {
          const { error: rowError } = await supabase.from('inbox_items').insert(row)
          if (!rowError) fallbackInserted += 1
        }

        finalStatus = 'success'
        finalMeta = {
          ...finalMeta,
          result: 'success',
          sources_fetched: sourcesFetched,
          sources_fetch_ok: sourcesFetchOk,
          sources_fetch_fail: sourcesFetchFail,
          items_parsed: itemsParsed,
          items_prepared: itemsPrepared,
          inserted: fallbackInserted,
          bulk_insert_attempted: bulkInsertAttempted,
          bulk_insert_failed: bulkInsertFailed,
        }
        return NextResponse.json({ inserted: fallbackInserted })
      }
    }

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      result: 'success',
      sources_fetched: sourcesFetched,
      sources_fetch_ok: sourcesFetchOk,
      sources_fetch_fail: sourcesFetchFail,
      items_parsed: itemsParsed,
      items_prepared: itemsPrepared,
      inserted: itemsToInsert.length,
      bulk_insert_attempted: bulkInsertAttempted,
      bulk_insert_failed: bulkInsertFailed,
    }
    return NextResponse.json({ inserted: itemsToInsert.length })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'RSS fetch failed.'
    return NextResponse.json({ error: 'RSS fetch failed.' }, { status: 500 })
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
