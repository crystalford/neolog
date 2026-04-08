export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ParsedOutline = { title: string | null; xmlUrl: string }

function extractOutlines(opmlXml: string): ParsedOutline[] {
  const results: ParsedOutline[] = []
  const xml = String(opmlXml || '')

  // Very small, permissive parser: find <outline ... xmlUrl="..." ...>
  const outlineTags = xml.match(/<outline\b[^>]*>/gi) || []
  for (const tag of outlineTags) {
    const xmlUrlMatch = tag.match(/\bxmlUrl\s*=\s*(["'])(.*?)\1/i)
    const xmlUrl = xmlUrlMatch?.[2]?.trim()
    if (!xmlUrl) continue

    const titleMatch = tag.match(/\btitle\s*=\s*(["'])(.*?)\1/i) || tag.match(/\btext\s*=\s*(["'])(.*?)\1/i)
    const title = titleMatch?.[2] ? String(titleMatch[2]).trim() : null

    try {
      const parsed = new URL(xmlUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    } catch {
      continue
    }

    results.push({ title, xmlUrl })
  }

  // De-dupe by URL
  const seen = new Set<string>()
  return results.filter((o) => {
    if (seen.has(o.xmlUrl)) return false
    seen.add(o.xmlUrl)
    return true
  })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { opml?: string } | null
  const opml = typeof body?.opml === 'string' ? body.opml : ''

  if (!opml.trim()) {
    return NextResponse.json({ error: 'opml is required.' }, { status: 400 })
  }

  const outlines = extractOutlines(opml)
  if (outlines.length === 0) {
    return NextResponse.json({ error: 'No feeds found in OPML.' }, { status: 400 })
  }

  const limit = Math.min(outlines.length, 200)
  const batch = outlines.slice(0, limit)

  const urls = batch.map((o) => o.xmlUrl)
  const { data: existing } = await supabase
    .from('feed_sources')
    .select('url')
    .eq('user_id', session.user.id)
    .in('url', urls)

  const existingSet = new Set((existing || []).map((r: any) => String(r.url || '')))

  const toInsert = batch
    .filter((o) => !existingSet.has(o.xmlUrl))
    .map((o) => ({
      user_id: session.user.id,
      source_type: 'rss',
      name: o.title,
      url: o.xmlUrl,
      is_active: true,
    }))

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, skipped: batch.length })
  }

  const { error } = await supabase.from('feed_sources').insert(toInsert)
  if (error) {
    return NextResponse.json({ error: 'Failed to import OPML.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, imported: toInsert.length, skipped: batch.length - toInsert.length })
}
