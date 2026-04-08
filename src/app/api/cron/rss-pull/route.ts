export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { parseRss } from '@/lib/rss/parse'
import { createAdminClient } from '@/lib/supabase/admin'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

function generateSlug(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)
}

const stripHtml = (html: string) =>
  String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  let runId: string | null = null
  try {
    const started = await startJobRun('cron.rss.pull', {
      path: '/api/cron/rss-pull',
    })
    runId = started.id
  } catch {
    // Best-effort only: cron should still run even if jobs/job_runs tables aren't deployed yet.
  }

  const supabase = createAdminClient()
  if (!supabase) {
    if (runId) {
      try {
        await finishJobRun(runId, 'error', { duration_ms: Date.now() - startedAt }, 'Missing Supabase configuration')
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  let sources: any[] | null = null
  let error: any = null

  {
    const attempt = await supabase
      .from('feed_sources')
      .select('id, user_id, url, publication_id, auto_convert_to_drafts, consecutive_failures')
      .eq('source_type', 'rss')
      .eq('is_active', true)

    sources = attempt.data as any[] | null
    error = attempt.error

    if (error) {
      const msg = String(error.message || '')
      const looksLikeMissingColumn =
        msg.includes('publication_id') ||
        msg.includes('auto_convert_to_drafts') ||
        msg.includes('consecutive_failures')
      if (looksLikeMissingColumn) {
        const fallback = await supabase
          .from('feed_sources')
          .select('id, user_id, url')
          .eq('source_type', 'rss')
          .eq('is_active', true)

        sources = fallback.data as any[] | null
        error = fallback.error
      }
    }
  }

  if (error) {
    if (runId) {
      try {
        await finishJobRun(
          runId,
          'error',
          { duration_ms: Date.now() - startedAt },
          'Failed to load sources.'
        )
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ error: 'Failed to load sources.' }, { status: 500 })
  }

  const envAutoConvert =
    process.env.RSS_AUTO_CONVERT_TO_DRAFTS === 'true' || process.env.RSS_AUTO_CONVERT_TO_DRAFTS === '1'

  const maxFailuresRaw = process.env.RSS_MAX_CONSECUTIVE_FAILURES
  const maxFailures = maxFailuresRaw ? Math.max(1, Math.min(50, Number(maxFailuresRaw))) : 10

  let inserted = 0
  let converted = 0
  let convert_failed = 0

  const insertedInboxItems: Array<{
    id: string
    user_id: string
    source_url: string | null
    title: string | null
    canonical_url: string | null
    raw_data: any
  }> = []

  const sourceSettings: Record<string, Record<string, { publicationId: string | null; autoConvert: boolean }>> = {}
  for (const source of sources || []) {
    const userId = String((source as any).user_id || '')
    const url = String((source as any).url || '')
    if (!userId || !url) continue
    sourceSettings[userId] = sourceSettings[userId] || {}
    sourceSettings[userId][url] = {
      publicationId: (source as any).publication_id ? String((source as any).publication_id) : null,
      autoConvert: Boolean((source as any).auto_convert_to_drafts),
    }
  }

  for (const source of sources || []) {
    try {
      const response = await fetch(source.url, {
        redirect: 'follow',
        headers: {
          'user-agent': 'neolog-rss/1.0',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      })
      if (!response.ok) {
        try {
          const currentFailures = Number((source as any).consecutive_failures || 0) || 0
          const nextFailures = currentFailures + 1
          const shouldDisable = nextFailures >= maxFailures
          await supabase
            .from('feed_sources')
            .update({
              consecutive_failures: nextFailures,
              last_fetch_status_code: response.status,
              last_error: `Fetch failed (${response.status}).`,
              ...(shouldDisable ? { is_active: false } : {}),
            } as any)
            .eq('id', source.id)
        } catch {
          // best-effort
        }
        continue
      }

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
        const { data: bulkInserted, error: insertError } = await supabase
          .from('inbox_items')
          .insert(itemsToInsert)
          .select('id, user_id, source_url, title, canonical_url, raw_data')

        if (!insertError) {
          inserted += itemsToInsert.length
          if (bulkInserted && bulkInserted.length > 0) {
            insertedInboxItems.push(...(bulkInserted as any))
          }
        } else {
          for (const row of itemsToInsert) {
            const { data: rowInserted, error: rowError } = await supabase
              .from('inbox_items')
              .insert(row)
              .select('id, user_id, source_url, title, canonical_url, raw_data')
              .maybeSingle()
            if (!rowError && rowInserted) {
              inserted += 1
              insertedInboxItems.push(rowInserted as any)
            }
          }
        }
      }

      try {
        await supabase
          .from('feed_sources')
          .update({
            last_fetched_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            last_fetch_status_code: 200,
            last_error: null,
            consecutive_failures: 0,
          } as any)
          .eq('id', source.id)
      } catch {
        await supabase
          .from('feed_sources')
          .update({ last_fetched_at: new Date().toISOString() })
          .eq('id', source.id)
      }
    } catch (e) {
      console.error('RSS cron error:', e)
      try {
        const currentFailures = Number((source as any).consecutive_failures || 0) || 0
        const nextFailures = currentFailures + 1
        const shouldDisable = nextFailures >= maxFailures
        await supabase
          .from('feed_sources')
          .update({
            consecutive_failures: nextFailures,
            last_fetch_status_code: null,
            last_error: 'Fetch error.',
            ...(shouldDisable ? { is_active: false } : {}),
          } as any)
          .eq('id', source.id)
      } catch {
        // best-effort
      }
    }
  }

  const shouldConvertAny =
    envAutoConvert ||
    Object.values(sourceSettings).some((byUrl) => Object.values(byUrl).some((s) => s.autoConvert))

  if (shouldConvertAny && insertedInboxItems.length > 0) {
    const byUser: Record<string, typeof insertedInboxItems> = {}
    for (const item of insertedInboxItems) {
      if (!item.user_id) continue
      byUser[item.user_id] = byUser[item.user_id] || []
      byUser[item.user_id].push(item)
    }

    for (const userId of Object.keys(byUser)) {
      const items = byUser[userId]
      const resolveDefaultPublicationId = async () => {
        try {
          const { data: pub } = await supabase
            .from('publications')
            .select('id')
            .eq('owner_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          return pub?.id || null
        } catch {
          return null
        }
      }

      let defaultPublicationId: string | null | undefined = undefined

      const canonicalUrls = Array.from(new Set(items.map((i) => i.canonical_url).filter(Boolean)))
      const { data: existingPosts } = await supabase
        .from('posts')
        .select('canonical_url')
        .eq('author_id', userId)
        .in('canonical_url', canonicalUrls)

      const existingCanonical = new Set(
        (existingPosts || []).map((row: any) => String(row.canonical_url || '')).filter(Boolean),
      )

      for (const inboxItem of items) {
        const perSource = sourceSettings[userId]?.[String(inboxItem.source_url || '')]
        const perSourceWantsConvert = perSource?.autoConvert === true
        const shouldConvertThis = envAutoConvert || perSourceWantsConvert
        if (!shouldConvertThis) continue

        const canonicalUrl = String(inboxItem.canonical_url || '').trim()
        if (!canonicalUrl || existingCanonical.has(canonicalUrl)) {
          continue
        }

        const title = String(inboxItem.title || inboxItem.raw_data?.title || 'Imported draft')
        const contentHtml =
          String(inboxItem.raw_data?.content_html || '').trim() ||
          `<p><a href="${canonicalUrl}">${canonicalUrl}</a></p>`
        const excerptPlain = stripHtml(contentHtml)
        const excerpt = excerptPlain
          ? excerptPlain.substring(0, 160) + (excerptPlain.length > 160 ? '...' : '')
          : ''

        const baseSlug = generateSlug(title) || 'imported-draft'
        const hash = canonicalUrl ? canonicalUrl.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16).slice(0, 6) : 'rss'

        let createdPostId: string | null = null
        const candidates = [baseSlug, `${baseSlug}-${hash}`, `${baseSlug}-${hash}-${Date.now().toString(36).slice(-4)}`]

        for (const slug of candidates) {
          if (defaultPublicationId === undefined) {
            defaultPublicationId = await resolveDefaultPublicationId()
          }

          const publicationId = perSource?.publicationId || defaultPublicationId || null

          const { data: post, error } = await supabase
            .from('posts')
            .insert({
              author_id: userId,
              publication_id: publicationId,
              title,
              slug,
              content: contentHtml,
              content_html: contentHtml,
              content_type: 'html',
              excerpt,
              status: 'draft',
              canonical_url: canonicalUrl,
              original_source: 'rss',
            })
            .select('id')
            .maybeSingle()

          if (!error && post?.id) {
            createdPostId = post.id
            break
          }

          const code = String((error as any)?.code || '')
          if (code !== '23505') {
            // Not a unique constraint; don't spin.
            break
          }
        }

        if (createdPostId) {
          converted += 1
          existingCanonical.add(canonicalUrl)
          await supabase
            .from('inbox_items')
            .update({ status: 'imported' })
            .eq('id', inboxItem.id)
        } else {
          convert_failed += 1
        }
      }
    }
  }

  if (runId) {
    try {
      await finishJobRun(runId, 'success', {
        duration_ms: Date.now() - startedAt,
        sources_count: (sources || []).length,
        inserted,
        ...(shouldConvertAny ? { converted, convert_failed } : {}),
      })
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ inserted, ...(shouldConvertAny ? { converted, convert_failed } : {}) })
}
