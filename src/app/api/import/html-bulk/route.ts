import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

function ensureFullHtmlDoc(html: string, title: string): string {
  const raw = String(html || '').trim()
  if (!raw) return ''
  const isFull = /<!doctype/i.test(raw) || /<html[\s>]/i.test(raw)
  if (isFull) return raw
  const safeTitle = String(title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${safeTitle}</title></head><body>${raw}</body></html>`
}

function decodeEntities(text: string): string {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function extractMetaContent(html: string, selectors: Array<{ attr: 'name' | 'property'; value: string }>): string {
  const input = String(html || '')
  for (const sel of selectors) {
    const re = new RegExp(`<meta[^>]+${sel.attr}=["']${sel.value}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
    const m = input.match(re)
    if (m?.[1]) return decodeEntities(m[1]).trim()
  }
  return ''
}

function extractTitle(html: string, filenameFallback: string): string {
  const fromOg = extractMetaContent(html, [{ attr: 'property', value: 'og:title' }])
  if (fromOg) return fromOg

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (titleTag) {
    const cleaned = stripHtml(titleTag)
    if (cleaned) return cleaned
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (h1) {
    const cleaned = stripHtml(h1)
    if (cleaned) return cleaned
  }

  return filenameFallback
}

function extractSubtitle(html: string, title: string): string {
  const fromDesc = extractMetaContent(html, [
    { attr: 'name', value: 'description' },
    { attr: 'property', value: 'og:description' },
  ])
  if (fromDesc && fromDesc !== title) return fromDesc

  const paragraphRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let match: RegExpExecArray | null
  while ((match = paragraphRe.exec(html)) !== null) {
    const text = stripHtml(match[1])
    if (text.length >= 40 && text.length <= 180 && text !== title) return text
  }

  return ''
}

function extractCoverImage(html: string): string {
  const fromOg = extractMetaContent(html, [{ attr: 'property', value: 'og:image' }])
  if (fromOg) return fromOg

  const imgMatch = String(html || '').match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
  if (imgMatch?.[1]) return decodeEntities(imgMatch[1]).trim()

  return ''
}

function stripHeaderFooter(html: string): string {
  // Intentionally blunt: this is a bulk tool meant to remove exported site chrome.
  return String(html || '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
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

  const form = await request.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const publicationId = form.get('publication_id') as string
  if (!publicationId) {
    return NextResponse.json({ error: 'publication_id is required' }, { status: 400 })
  }

  const files = form.getAll('files').filter(Boolean) as File[]
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  if (files.length > 200) {
    return NextResponse.json({ error: 'Too many files (max 200)' }, { status: 400 })
  }

  const baseSlugs = Array.from(
    new Set(
      files
        .map((f) => {
          const base = String((f as any)?.name || '')
            .replace(/\.(html|htm)$/i, '')
            .replace(/[_-]+/g, ' ')
            .trim()
          return generateSlug(base)
        })
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

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const filename = String((file as any)?.name || '').trim()
    const filenameFallback = filename
      .replace(/\.(html|htm)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()

    let raw = ''
    try {
      raw = await file.text()
    } catch {
      failed += 1
      if (failures.length < 50) failures.push({ filename: filename || undefined, error: 'Unable to read file' })
      continue
    }

    const cleaned = stripHeaderFooter(raw)
    const title = extractTitle(cleaned, filenameFallback || 'Untitled').trim()
    const subtitle = extractSubtitle(cleaned, title).trim()
    const coverImageUrl = extractCoverImage(cleaned).trim()
    const contentHtml = ensureFullHtmlDoc(cleaned, title)

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
        publication_id: publicationId,
        title,
        subtitle: subtitle || null,
        slug,
        content: contentHtml,
        content_html: contentHtml,
        content_type: 'html',
        excerpt: excerpt || null,
        cover_image_url: coverImageUrl || null,
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

  return NextResponse.json({ imported, failed, created, failures })
}
