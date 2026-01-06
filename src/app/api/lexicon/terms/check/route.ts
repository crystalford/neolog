import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'

export const dynamic = 'force-dynamic'

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

function getAuthHeaderKey(request: NextRequest) {
  return (
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as null | {
    publicationId?: unknown
    publication_id?: unknown
    terms?: unknown
  }

  const publicationIdRaw =
    (typeof body?.publicationId === 'string' ? body.publicationId : null) ||
    (typeof body?.publication_id === 'string' ? body.publication_id : null) ||
    ''
  const publicationId = publicationIdRaw && publicationIdRaw !== 'null' && publicationIdRaw !== 'none' ? publicationIdRaw.trim() : ''

  if (publicationId && !isUuid(publicationId)) {
    return NextResponse.json({ error: 'Invalid publicationId' }, { status: 400 })
  }

  const terms = Array.isArray(body?.terms) ? body?.terms : []
  const normalized = terms
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 200)

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'terms is required' }, { status: 400 })
  }

  const slugs = normalized.map(slugify).filter(Boolean)
  const uniqueSlugs = Array.from(new Set(slugs))

  const rawKey = getAuthHeaderKey(request)
  const hasAutomationKey = Boolean(rawKey)

  const fetchTerms = async (client: any, ownerId: string) => {
    let q = client
      .from('canonical_terms')
      .select('id, name, slug, definition_md, status, locked, current_version, publication_id')
      .eq('owner_id', ownerId)
      .in('slug', uniqueSlugs)

    if (publicationId) {
      q = q.or(`publication_id.eq.${publicationId},publication_id.is.null`)
    }

    const { data, error } = await q
    if (error) return { error }
    return { data: data || [] }
  }

  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })

    const result = await fetchTerms(admin, auth.userId)
    if (result.error) return NextResponse.json({ error: 'Check failed.' }, { status: 500 })

    const found = result.data as any[]
    const foundSlugs = new Set(found.map((t) => t.slug))
    const missing = uniqueSlugs.filter((s) => !foundSlugs.has(s))

    return NextResponse.json({ ok: true, found, missing })
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await fetchTerms(supabase, session.user.id)
  if (result.error) return NextResponse.json({ error: 'Check failed.' }, { status: 500 })

  const found = result.data as any[]
  const foundSlugs = new Set(found.map((t) => t.slug))
  const missing = uniqueSlugs.filter((s) => !foundSlugs.has(s))

  return NextResponse.json({ ok: true, found, missing })
}
