import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRss } from '@/lib/rss/parse'
import crypto from 'crypto'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

function stripHtml(html: string): string {
  return html
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
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60)
}

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 6)
}

function makeUniqueSlug(options: {
  base: string
  canonicalUrl: string
  existingSlugs: Set<string>
  usedSlugs: Set<string>
}): string {
  const base = options.base.trim() || `import-${shortHash(options.canonicalUrl || String(Date.now()))}`
  const normalize = (s: string) => s.substring(0, 60).replace(/^-|-$/g, '')

  let candidate = normalize(base)
  if (!candidate) candidate = `import-${shortHash(options.canonicalUrl || String(Date.now()))}`

  if (!options.existingSlugs.has(candidate) && !options.usedSlugs.has(candidate)) {
    options.usedSlugs.add(candidate)
    return candidate
  }

  const hashed = normalize(`${candidate}-${shortHash(options.canonicalUrl || candidate)}`)
  candidate = hashed || `import-${shortHash(options.canonicalUrl || String(Date.now()))}`
  if (!options.existingSlugs.has(candidate) && !options.usedSlugs.has(candidate)) {
    options.usedSlugs.add(candidate)
    return candidate
  }

  for (let i = 2; i < 1000; i++) {
    const suffix = `-${i}`
    const trimmedBase = candidate.length + suffix.length > 60
      ? candidate.substring(0, 60 - suffix.length)
      : candidate
    const next = normalize(`${trimmedBase}${suffix}`)
    if (!options.existingSlugs.has(next) && !options.usedSlugs.has(next)) {
      options.usedSlugs.add(next)
      return next
    }
  }

  const fallback = `import-${shortHash(`${options.canonicalUrl}-${Date.now()}`)}`
  options.usedSlugs.add(fallback)
  return fallback
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  const finish = async (
    status: 'success' | 'error',
    meta: Record<string, any> = {},
    errorMessage?: string,
  ) => {
    try {
      if (!runId) return
      await finishJobRun(runId, status, { duration_ms: Date.now() - startedAt, ...meta }, errorMessage)
    } catch {
      // best-effort
    }
  }

  try {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const run = await startJobRun('import.rss', { user_id: session.user.id })
      runId = run.id
    } catch {
      // best-effort
    }

    const body = (await request.json().catch(() => null)) as
      | { feedUrl?: string; limit?: number; status?: 'draft' | 'published' }
      | null

    const feedUrl = typeof body?.feedUrl === 'string' ? body.feedUrl.trim() : ''
    const status = body?.status === 'published' ? 'published' : 'draft'
    const limitRaw = typeof body?.limit === 'number' ? body.limit : 50
    const limit = Math.max(1, Math.min(200, Math.floor(limitRaw || 50)))

    if (!feedUrl) {
      await finish('error', { user_id: session.user.id }, 'feedUrl is required')
      return NextResponse.json({ error: 'feedUrl is required' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(feedUrl)
    } catch {
      await finish('error', { user_id: session.user.id, feed_url: feedUrl }, 'feedUrl must be a valid URL')
      return NextResponse.json({ error: 'feedUrl must be a valid URL' }, { status: 400 })
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      await finish('error', { user_id: session.user.id, feed_url: feedUrl }, 'feedUrl must be http(s)')
      return NextResponse.json({ error: 'feedUrl must be http(s)' }, { status: 400 })
    }

    const res = await fetch(feedUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'neolog-import/1.0',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      await finish('error', { user_id: session.user.id, feed_url: feedUrl, status_code: res.status }, `Failed to fetch feed (${res.status}).`)
      return NextResponse.json(
        { error: `Failed to fetch feed (${res.status}). ${text.slice(0, 200)}` },
        { status: 400 },
      )
    }

    const xml = await res.text()
    const items = parseRss(xml)
      .filter((item) => item?.title && item?.link)
      .slice(0, limit)

    if (items.length === 0) {
      await finish('success', { user_id: session.user.id, feed_url: feedUrl, imported: 0, skipped: 0, failed: 0 })
      return NextResponse.json({ imported: 0, skipped: 0, failed: 0 })
    }

    const links = Array.from(new Set(items.map((i) => i.link).filter(Boolean)))

    const { data: existingRows } = await supabase
      .from('posts')
      .select('canonical_url')
      .eq('author_id', session.user.id)
      .in('canonical_url', links)

    const existing = new Set((existingRows || []).map((row: any) => String(row.canonical_url || '')))

    const toImport = items.filter((item) => !existing.has(item.link))

    if (toImport.length === 0) {
      await finish('success', { user_id: session.user.id, feed_url: feedUrl, imported: 0, skipped: items.length, failed: 0 })
      return NextResponse.json({ imported: 0, skipped: items.length, failed: 0 })
    }

    const baseSlugs = Array.from(
      new Set(
        toImport
          .map((item) => generateSlug(item.title))
          .filter(Boolean)
          .slice(0, 200),
      ),
    )

    const { data: existingSlugRows } = await supabase
      .from('posts')
      .select('slug')
      .eq('author_id', session.user.id)
      .in('slug', baseSlugs)

    const existingSlugs = new Set((existingSlugRows || []).map((row: any) => String(row.slug || '')).filter(Boolean))
    const usedSlugs = new Set<string>()

    const rows = toImport.map((item) => {
      const contentHtml = (item.content || '').trim() || `<p><a href="${item.link}">${item.link}</a></p>`
      const excerpt = stripHtml(contentHtml)
      const publishedAt = item.published_at ? new Date(item.published_at).toISOString() : new Date().toISOString()

      const base = generateSlug(item.title)
      const slug = makeUniqueSlug({
        base,
        canonicalUrl: item.link,
        existingSlugs,
        usedSlugs,
      })

      return {
        author_id: session.user.id,
        title: item.title,
        slug,
        content: contentHtml,
        content_html: contentHtml,
        content_type: 'html',
        excerpt: excerpt ? excerpt.substring(0, 160) + (excerpt.length > 160 ? '...' : '') : '',
        canonical_url: item.link,
        original_source: feedUrl,
        status,
        published_at: status === 'published' ? publishedAt : null,
        created_at: publishedAt,
      }
    })

    if (rows.length === 0) {
      await finish('success', { user_id: session.user.id, feed_url: feedUrl, imported: 0, skipped: items.length, failed: 0 })
      return NextResponse.json({ imported: 0, skipped: items.length, failed: 0 })
    }

    let imported = 0
    let failed = 0
    let skipped = items.length - rows.length
    const failures: Array<{ url: string; error: string }> = []

    for (const row of rows) {
      const { error } = await supabase.from('posts').insert(row)
      if (!error) {
        imported += 1
        continue
      }

      const code = String((error as any).code || '')
      if (code === '23505') {
        skipped += 1
      } else {
        failed += 1
        if (failures.length < 10) {
          failures.push({ url: String((row as any).canonical_url || ''), error: String(error.message || 'Insert failed') })
        }
      }
    }

    await finish('success', { user_id: session.user.id, feed_url: feedUrl, imported, skipped, failed })
    return NextResponse.json({
      imported,
      skipped,
      failed,
      ...(failures.length ? { failures } : {}),
    })
  } catch (error) {
    console.error('RSS import error:', error)
    await finish('error', {}, (error as any)?.message || 'RSS import failed')
    return NextResponse.json({ error: 'RSS import failed' }, { status: 500 })
  }
}
