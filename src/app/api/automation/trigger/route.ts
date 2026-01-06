import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { parseRss } from '@/lib/rss/parse'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const auth = await requireAutomationKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const event = typeof body.event === 'string' ? body.event : ''

  if (event === 'inbox.create') {
    const startedAt = Date.now()
    let runId: string | null = null
    try {
      const run = await startJobRun('automation.trigger.inbox.create', {
        event,
        user_id: auth.userId,
      })
      runId = run.id
    } catch {
      // best-effort: don't break the automation endpoint if job tables aren't deployed
    }

    const sourceType = typeof body.sourceType === 'string' ? body.sourceType : 'webhook'
    const title = typeof body.title === 'string' ? body.title : null
    const canonicalUrl = typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : null
    const rawData = body.rawData && typeof body.rawData === 'object' ? body.rawData : {}

    const { data, error } = await admin
      .from('inbox_items')
      .insert({
        user_id: auth.userId,
        source_type: sourceType,
        title,
        canonical_url: canonicalUrl,
        source_url: sourceUrl,
        raw_data: rawData,
        status: 'new',
      })
      .select('id')
      .single()

    if (error || !data) {
      try {
        if (runId) {
          await finishJobRun(
            runId,
            'error',
            { duration_ms: Date.now() - startedAt },
            error?.message || 'Failed to create inbox item.',
          )
        }
      } catch {
        // best-effort
      }
      return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
    }

    try {
      if (runId) {
        await finishJobRun(runId, 'success', {
          duration_ms: Date.now() - startedAt,
          inbox_item_id: data.id,
        })
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({ id: data.id })
  }

  if (event === 'rss.pull') {
    const startedAt = Date.now()
    let runId: string | null = null
    try {
      const run = await startJobRun('automation.trigger.rss.pull', {
        event,
        user_id: auth.userId,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    const { data: sources, error: sourcesError } = await admin
      .from('feed_sources')
      .select('id, url')
      .eq('user_id', auth.userId)
      .eq('source_type', 'rss')
      .eq('is_active', true)

    if (sourcesError) {
      try {
        if (runId) {
          await finishJobRun(
            runId,
            'error',
            { duration_ms: Date.now() - startedAt },
            sourcesError.message || 'Failed to load sources.',
          )
        }
      } catch {
        // best-effort
      }
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

        const { data: existingRows } = await admin
          .from('inbox_items')
          .select('canonical_url')
          .eq('user_id', auth.userId)
          .in('canonical_url', links)

        const existing = new Set((existingRows || []).map((row: any) => row.canonical_url))

        const itemsToInsert = items
          .filter((item) => item.link && !existing.has(item.link))
          .slice(0, 30)
          .map((item) => ({
            user_id: auth.userId,
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
          const { error: insertError } = await admin.from('inbox_items').insert(itemsToInsert)
          if (!insertError) inserted += itemsToInsert.length
        }

        await admin
          .from('feed_sources')
          .update({ last_fetched_at: new Date().toISOString() })
          .eq('id', source.id)
      } catch {
        // swallow per-source errors so one bad feed doesn't break the batch
      }
    }

    try {
      if (runId) {
        await finishJobRun(runId, 'success', {
          duration_ms: Date.now() - startedAt,
          inserted,
          sources_count: (sources || []).length,
        })
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({ inserted })
  }

  return NextResponse.json(
    { error: 'Unknown event. Try event="inbox.create" or event="rss.pull".' },
    { status: 400 }
  )
}
