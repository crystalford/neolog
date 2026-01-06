import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'

export const dynamic = 'force-dynamic'

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
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
    termId?: unknown
    term_id?: unknown
    definition_md?: unknown
    change_summary?: unknown
  }

  const termIdRaw =
    (typeof body?.termId === 'string' ? body.termId : null) ||
    (typeof body?.term_id === 'string' ? body.term_id : null) ||
    ''
  const termId = termIdRaw.trim()

  const definitionMd = typeof body?.definition_md === 'string' ? body.definition_md : ''
  const changeSummary = typeof body?.change_summary === 'string' ? body.change_summary : null

  if (!termId || !isUuid(termId)) return NextResponse.json({ error: 'termId is required' }, { status: 400 })

  const rawKey = getAuthHeaderKey(request)
  const hasAutomationKey = Boolean(rawKey)

  const propose = async (client: any, ownerId: string) => {
    // Load current version
    const { data: current, error: currentError } = await client
      .from('canonical_terms')
      .select('id, owner_id, current_version, locked')
      .eq('id', termId)
      .eq('owner_id', ownerId)
      .maybeSingle()

    if (currentError) return { error: currentError }
    if (!current) return { notFound: true as const }
    if (current.locked) return { locked: true as const }

    const nextVersion = (current.current_version || 1) + 1

    const { data: v, error: vError } = await client
      .from('canonical_term_versions')
      .insert({
        term_id: termId,
        version_number: nextVersion,
        definition_md: definitionMd,
        change_summary: changeSummary,
        created_by: ownerId,
      })
      .select('id')
      .single()

    if (vError || !v) return { error: vError || new Error('Failed to create version') }

    const { error: updateError } = await client
      .from('canonical_terms')
      .update({
        definition_md: definitionMd,
        current_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', termId)
      .eq('owner_id', ownerId)

    if (updateError) return { error: updateError }

    return { ok: true as const, version: nextVersion }
  }

  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })

    const result = await propose(admin, auth.userId)
    if (result.notFound) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (result.locked) return NextResponse.json({ error: 'Term is locked' }, { status: 409 })
    if ((result as any).error) return NextResponse.json({ error: 'Failed to propose version.' }, { status: 500 })

    return NextResponse.json(result)
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await propose(supabase, session.user.id)
  if (result.notFound) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (result.locked) return NextResponse.json({ error: 'Term is locked' }, { status: 409 })
  if ((result as any).error) return NextResponse.json({ error: 'Failed to propose version.' }, { status: 500 })

  return NextResponse.json(result)
}
