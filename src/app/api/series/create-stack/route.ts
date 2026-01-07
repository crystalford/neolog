import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { marked } from 'marked'

export const dynamic = 'force-dynamic'

type Body = {
  title?: unknown
  description?: unknown
  coverImageUrl?: unknown

  researchDoc?: unknown
  infographicHtml?: unknown
  essay?: unknown

  createDrafts?: unknown
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60)
}

function stableHashHex6(input: string): string {
  return (
    input
      .split('')
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
      .toString(16)
      .slice(0, 6)
  )
}

function ensureFullHtmlDoc(html: string, title: string): string {
  const raw = String(html || '').trim()
  if (!raw) return ''
  const isFull = /<!doctype/i.test(raw) || /<html[\s>]/i.test(raw)
  if (isFull) return raw
  const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${safeTitle}</title></head><body>${raw}</body></html>`
}

function toMarkdownHtml(md: string): string {
  return String(marked.parse(md || ''))
}

async function insertSeriesWithFallback(
  db: any,
  row: { author_id: string; title: string; slug: string; description?: string | null; cover_image_url?: string | null },
) {
  const tryInsert = async (slug: string) => {
    return await db
      .from('series')
      .insert({ ...row, slug })
      .select('id, slug')
      .single()
  }

  let { data, error } = await tryInsert(row.slug)
  if (!error && data) return { data, error: null }

  const code = String((error as any)?.code || '')
  if (code !== '23505') return { data: null, error }

  const suffix = stableHashHex6(`${row.author_id}:${row.title}:${Date.now()}`)
  ;({ data, error } = await tryInsert(`${row.slug}-${suffix}`))
  return { data: data || null, error: error || null }
}

async function insertPostWithFallback(
  db: any,
  row: {
    author_id: string
    title: string
    slug: string
    content: string | null
    content_html: string | null
    content_type: 'html' | 'markdown'
    status: 'draft'
    series_id: string
    series_order: number
  },
) {
  const tryInsert = async (slug: string) => {
    return await db
      .from('posts')
      .insert({ ...row, slug })
      .select('id, slug')
      .single()
  }

  let { data, error } = await tryInsert(row.slug)
  if (!error && data) return { data, error: null }

  const code = String((error as any)?.code || '')
  if (code !== '23505') return { data: null, error }

  const suffix = stableHashHex6(`${row.author_id}:${row.title}:${Date.now()}`)
  ;({ data, error } = await tryInsert(`${row.slug}-${suffix}`))
  return { data: data || null, error: error || null }
}

export async function POST(request: NextRequest) {
  const rawKey = request.headers.get('x-api-key') || request.headers.get('x-neolog-key')
  const hasApiKey = Boolean(rawKey && String(rawKey).trim())

  const supabase = createClient()
  const admin = createAdminClient()

  let userId = ''
  let db: any = supabase

  if (hasApiKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }
    if (!admin) {
      return NextResponse.json({ error: 'Server missing Supabase admin configuration.' }, { status: 500 })
    }
    userId = auth.userId
    db = admin
  } else {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    userId = session.user.id
    db = supabase
  }

  const body = (await request.json().catch(() => null)) as Body | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const coverImageUrl = typeof body?.coverImageUrl === 'string' ? body.coverImageUrl.trim() : ''

  const researchDoc = typeof body?.researchDoc === 'string' ? body.researchDoc.trim() : ''
  const infographicHtml = typeof body?.infographicHtml === 'string' ? body.infographicHtml.trim() : ''
  const essay = typeof body?.essay === 'string' ? body.essay.trim() : ''

  const createDraftsRaw = body?.createDrafts
  const createDrafts = typeof createDraftsRaw === 'boolean' ? createDraftsRaw : true

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const seriesSlug = slugify(title)

  const { data: seriesRow, error: seriesError } = await insertSeriesWithFallback(db, {
    author_id: userId,
    title,
    slug: seriesSlug,
    description: description || null,
    cover_image_url: coverImageUrl || null,
  })

  if (seriesError || !seriesRow) {
    const code = String((seriesError as any)?.code || '')
    if (code === '42501') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to create stack' }, { status: 500 })
  }

  const seriesId = seriesRow.id as string

  const shouldCreate = createDrafts && (researchDoc || infographicHtml || essay)
  const created: Record<string, { id: string; slug: string }> = {}

  const rollback = async () => {
    try {
      await db.from('posts').delete().eq('series_id', seriesId).eq('author_id', userId)
    } catch {
      // best-effort
    }
    try {
      await db.from('series').delete().eq('id', seriesId).eq('author_id', userId)
    } catch {
      // best-effort
    }
  }

  if (shouldCreate) {
    try {
      let seriesOrder = 1

      if (infographicHtml) {
        const htmlDoc = ensureFullHtmlDoc(infographicHtml, `${title} — Infographic`)
        const { data, error } = await insertPostWithFallback(db, {
          author_id: userId,
          title: `${title} — Infographic`,
          slug: slugify(`${title}-infographic`),
          content: htmlDoc,
          content_html: htmlDoc,
          content_type: 'html',
          status: 'draft',
          series_id: seriesId,
          series_order: seriesOrder,
        })
        if (error || !data) {
          await rollback()
          return NextResponse.json({ error: 'Failed to create infographic draft', rolledBack: true }, { status: 500 })
        }
        created.infographic = data
        seriesOrder += 1
      }

      if (essay) {
        const html = toMarkdownHtml(essay)
        const { data, error } = await insertPostWithFallback(db, {
          author_id: userId,
          title: `${title} — Essay`,
          slug: slugify(`${title}-essay`),
          content: essay,
          content_html: html,
          content_type: 'markdown',
          status: 'draft',
          series_id: seriesId,
          series_order: seriesOrder,
        })
        if (error || !data) {
          await rollback()
          return NextResponse.json({ error: 'Failed to create essay draft', rolledBack: true }, { status: 500 })
        }
        created.essay = data
        seriesOrder += 1
      }

      if (researchDoc) {
        const html = toMarkdownHtml(researchDoc)
        const { data, error } = await insertPostWithFallback(db, {
          author_id: userId,
          title: `${title} — Research Dump`,
          slug: slugify(`${title}-research-dump`),
          content: researchDoc,
          content_html: html,
          content_type: 'markdown',
          status: 'draft',
          series_id: seriesId,
          series_order: seriesOrder,
        })
        if (error || !data) {
          await rollback()
          return NextResponse.json({ error: 'Failed to create research dump draft', rolledBack: true }, { status: 500 })
        }
        created.research = data
        seriesOrder += 1
      }

      try {
        await db.from('series').update({ post_count: Object.keys(created).length }).eq('id', seriesId)
      } catch {
        // best-effort
      }
    } catch {
      await rollback()
      return NextResponse.json({ error: 'Failed to create stack', rolledBack: true }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, seriesId, created })
}
