import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'

export const dynamic = 'force-dynamic'

type Body = {
  type?: unknown
  content?: unknown
  title?: unknown
  tags?: unknown
  source?: unknown
  source_platform?: unknown
  source_url?: unknown
  sourceUrl?: unknown
  meta?: unknown
}

function normalizeTags(input: unknown): string[] {
  const tags = Array.isArray(input) ? input : []
  return tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50)
}

const ALLOWED_TYPES = ['prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment'] as const

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null

  const assetType = typeof body?.type === 'string' ? body.type : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const title = typeof body?.title === 'string' ? body.title : null

  const sourcePlatform =
    (typeof body?.source_platform === 'string' ? body.source_platform : null) ||
    (typeof body?.source === 'string' ? body.source : null)

  const sourceUrl =
    (typeof body?.source_url === 'string' ? body.source_url : null) ||
    (typeof body?.sourceUrl === 'string' ? body.sourceUrl : null)

  const tags = normalizeTags(body?.tags)
  const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}

  if (!assetType) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(assetType as any)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  // Accept either API key (server/admin insert) OR logged-in session (RLS insert).
  const rawKey =
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''

  const hasAutomationKey = Boolean(rawKey.trim())

  // API-key path (only if an API key was actually provided)
  if (hasAutomationKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

    const { data, error } = await admin
      .from('assets')
      .insert({
        user_id: auth.userId,
        type: assetType,
        content,
        title,
        source_platform: sourcePlatform,
        source_url: sourceUrl,
        tags,
        meta,
      })
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id })
  }

  // Session path
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      user_id: session.user.id,
      type: assetType,
      content,
      title,
      source_platform: sourcePlatform,
      source_url: sourceUrl,
      tags,
      meta,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create asset.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
