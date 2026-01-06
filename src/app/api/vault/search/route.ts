import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'

export const dynamic = 'force-dynamic'

function parseIntOr(v: string | null, fallback: number) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normalizeTagsParam(v: string | null): string[] {
  if (!v) return []
  return v
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 25)
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const publicationIdRaw = (searchParams.get('publicationId') || searchParams.get('publication_id') || '').trim()
  const publicationId = publicationIdRaw && publicationIdRaw !== 'null' && publicationIdRaw !== 'none' ? publicationIdRaw : ''
  const type = (searchParams.get('type') || '').trim()
  const limit = Math.min(50, Math.max(1, parseIntOr(searchParams.get('limit'), 20)))
  const tags = normalizeTagsParam(searchParams.get('tags'))

  if (!q) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 })
  }

  if (publicationId && !isUuid(publicationId)) {
    return NextResponse.json({ error: 'Invalid publicationId' }, { status: 400 })
  }

  const rawKey =
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''

  const hasAutomationKey = Boolean(rawKey.trim())

  // API-key path (admin client)
  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

    let query = admin
      .from('assets')
      .select('id, type, title, content, tags, source_platform, source_url, publication_id, created_at')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (publicationId) query = query.eq('publication_id', publicationId)
    if (type) query = query.eq('type', type)
    if (tags.length > 0) query = query.contains('tags', tags)

    // Search in title OR content
    const escaped = q.replace(/,/g, ' ')
    query = query.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, results: data || [] })
  }

  // Session path (RLS)
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query = supabase
    .from('assets')
    .select('id, type, title, content, tags, source_platform, source_url, publication_id, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (publicationId) query = query.eq('publication_id', publicationId)
  if (type) query = query.eq('type', type)
  if (tags.length > 0) query = query.contains('tags', tags)

  const escaped = q.replace(/,/g, ' ')
  query = query.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, results: data || [] })
}
