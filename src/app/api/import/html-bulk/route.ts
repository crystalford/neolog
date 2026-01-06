import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ImportItem = {
  filename?: unknown
  title?: unknown
  subtitle?: unknown
  contentHtml?: unknown
}

type Body = {
  items?: unknown
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function generateSlug(title: string): string {
  return String(title || '')
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

function makeUniqueSlug(params: {
  base: string
  filename?: string
  title: string
  existingSlugs: Set<string>
  usedSlugs: Set<string>
  index: number
}): string {
  const { existingSlugs, usedSlugs } = params
  const rawBase = params.base || generateSlug(params.filename || '') || 'imported'
  let candidate = rawBase
  if (!candidate) candidate = 'imported'

  const collides = (value: string) => existingSlugs.has(value) || usedSlugs.has(value)
  if (!collides(candidate)) {
    usedSlugs.add(candidate)
    return candidate
  }

  const suffix = stableHashHex6(`${params.title}:${params.filename || ''}:${params.index}:${Date.now()}`)
  candidate = `${rawBase}-${suffix}`.substring(0, 60)
  usedSlugs.add(candidate)
  return candidate
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as Body | null
  const itemsRaw = Array.isArray(body?.items) ? body?.items : null
  if (!itemsRaw) {
    return NextResponse.json({ error: 'items must be an array' }, { status: 400 })
  }

  if (itemsRaw.length === 0) {
    return NextResponse.json({ imported: 0, failed: 0, created: [] })
  }

  if (itemsRaw.length > 200) {
    return NextResponse.json({ error: 'Too many files (max 200)' }, { status: 400 })
  }

  const items = itemsRaw as ImportItem[]
  const baseSlugs = Array.from(
    new Set(
      items
        .map((item) => (typeof item?.title === 'string' ? generateSlug(item.title) : ''))
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

  let imported = 0
  let failed = 0

  const created: Array<{ id: string; slug: string; title: string; filename?: string }> = []
  const failures: Array<{ filename?: string; error: string }> = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const filename = typeof item?.filename === 'string' ? item.filename.trim() : ''
    const title = typeof item?.title === 'string' ? item.title.trim() : ''
    const subtitle = typeof item?.subtitle === 'string' ? item.subtitle.trim() : ''
    const contentHtml = typeof item?.contentHtml === 'string' ? item.contentHtml.trim() : ''

    if (!title || !contentHtml) {
      failed += 1
      if (failures.length < 50) failures.push({ filename: filename || undefined, error: 'Missing title or HTML content' })
      continue
    }

    const base = generateSlug(title)
    const slug = makeUniqueSlug({
      base,
      filename,
      title,
      existingSlugs,
      usedSlugs,
      index,
    })

    const excerptText = stripHtml(contentHtml)
    const excerpt = excerptText ? excerptText.substring(0, 160) + (excerptText.length > 160 ? '...' : '') : ''

    const { data: row, error } = await supabase
      .from('posts')
      .insert({
        author_id: session.user.id,
        title,
        subtitle: subtitle || null,
        slug,
        content: contentHtml,
        content_html: contentHtml,
        content_type: 'html',
        excerpt: excerpt || null,
        status: 'draft',
      })
      .select('id, slug')
      .single()

    if (error || !row) {
      failed += 1
      if (failures.length < 50) failures.push({ filename: filename || undefined, error: String(error?.message || 'Insert failed') })
      continue
    }

    imported += 1
    created.push({ id: String(row.id), slug: String(row.slug), title, ...(filename ? { filename } : {}) })
  }

  return NextResponse.json({ imported, failed, created, ...(failures.length ? { failures } : {}) })
}
