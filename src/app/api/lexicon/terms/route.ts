import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'

export const dynamic = 'force-dynamic'

type TermRow = {
  id: string
  owner_id: string
  publication_id: string | null
  name: string
  slug: string
  definition_md: string
  status: 'draft' | 'canonical' | 'deprecated'
  locked: boolean
  current_version: number
  created_at: string
  updated_at: string
}

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const publicationIdRaw = (searchParams.get('publicationId') || searchParams.get('publication_id') || '').trim()
  const publicationId = publicationIdRaw && publicationIdRaw !== 'null' && publicationIdRaw !== 'none' ? publicationIdRaw : ''
  const id = (searchParams.get('id') || '').trim()
  const slug = (searchParams.get('slug') || '').trim()
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 50)))

  if (publicationId && !isUuid(publicationId)) {
    return NextResponse.json({ error: 'Invalid publicationId' }, { status: 400 })
  }

  if (id && !isUuid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const rawKey = getAuthHeaderKey(request)
  const hasAutomationKey = Boolean(rawKey)

  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })

    let q = admin
      .from('canonical_terms')
      .select('id, owner_id, publication_id, name, slug, definition_md, status, locked, current_version, created_at, updated_at')
      .eq('owner_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (publicationId) q = q.eq('publication_id', publicationId)
    if (id) q = q.eq('id', id)
    if (slug) q = q.eq('slug', slug)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: 'Failed to load terms.' }, { status: 500 })

    if (id || slug) {
      return NextResponse.json({ ok: true, term: (data?.[0] as TermRow) || null })
    }

    return NextResponse.json({ ok: true, terms: (data as TermRow[]) || [] })
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let q = supabase
    .from('canonical_terms')
    .select('id, owner_id, publication_id, name, slug, definition_md, status, locked, current_version, created_at, updated_at')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (publicationId) q = q.eq('publication_id', publicationId)
  if (id) q = q.eq('id', id)
  if (slug) q = q.eq('slug', slug)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Failed to load terms.' }, { status: 500 })

  if (id || slug) {
    return NextResponse.json({ ok: true, term: (data?.[0] as TermRow) || null })
  }

  return NextResponse.json({ ok: true, terms: (data as TermRow[]) || [] })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as null | {
    publicationId?: unknown
    publication_id?: unknown
    name?: unknown
    definition_md?: unknown
    status?: unknown
    locked?: unknown
    change_summary?: unknown
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const definitionMd = typeof body?.definition_md === 'string' ? body.definition_md : ''
  const status = typeof body?.status === 'string' ? body.status : 'draft'
  const locked = Boolean(body?.locked)
  const changeSummary = typeof body?.change_summary === 'string' ? body.change_summary : null

  const publicationIdRaw =
    (typeof body?.publicationId === 'string' ? body.publicationId : null) ||
    (typeof body?.publication_id === 'string' ? body.publication_id : null) ||
    ''
  const publicationId = publicationIdRaw && publicationIdRaw !== 'null' && publicationIdRaw !== 'none' ? publicationIdRaw.trim() : ''

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!['draft', 'canonical', 'deprecated'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (publicationId && !isUuid(publicationId)) {
    return NextResponse.json({ error: 'Invalid publicationId' }, { status: 400 })
  }

  const slug = slugify(name)
  if (!slug) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })

  const rawKey = getAuthHeaderKey(request)
  const hasAutomationKey = Boolean(rawKey)

  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })

    if (publicationId) {
      const { data: pub } = await admin
        .from('publications')
        .select('id')
        .eq('id', publicationId)
        .eq('owner_id', auth.userId)
        .maybeSingle()
      if (!pub) return NextResponse.json({ error: 'Invalid publicationId' }, { status: 400 })
    }

    const { data: term, error: termError } = await admin
      .from('canonical_terms')
      .insert({
        owner_id: auth.userId,
        publication_id: publicationId || null,
        name,
        slug,
        definition_md: definitionMd,
        status,
        locked,
        current_version: 1,
      })
      .select('id')
      .single()

    if (termError || !term) {
      return NextResponse.json({ error: termError?.message || 'Failed to create term.' }, { status: 500 })
    }

    await admin
      .from('canonical_term_versions')
      .insert({
        term_id: term.id,
        version_number: 1,
        definition_md: definitionMd,
        change_summary: changeSummary,
        created_by: auth.userId,
      })

    return NextResponse.json({ ok: true, id: term.id })
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: term, error: termError } = await supabase
    .from('canonical_terms')
    .insert({
      owner_id: session.user.id,
      publication_id: publicationId || null,
      name,
      slug,
      definition_md: definitionMd,
      status,
      locked,
      current_version: 1,
    })
    .select('id')
    .single()

  if (termError || !term) {
    return NextResponse.json({ error: termError?.message || 'Failed to create term.' }, { status: 500 })
  }

  await supabase
    .from('canonical_term_versions')
    .insert({
      term_id: term.id,
      version_number: 1,
      definition_md: definitionMd,
      change_summary: changeSummary,
      created_by: session.user.id,
    })

  return NextResponse.json({ ok: true, id: term.id })
}
