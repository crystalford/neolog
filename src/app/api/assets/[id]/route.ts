import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'

export const dynamic = 'force-dynamic'

type AssetType = 'prompt' | 'image' | 'code' | 'text' | 'link' | 'quote' | 'fragment'

const ALLOWED_TYPES: AssetType[] = ['prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment']

type PatchBody = {
  type?: unknown
  title?: unknown
  content?: unknown
  tags?: unknown
  meta?: unknown
  source_platform?: unknown
  source_url?: unknown
}

function normalizeTags(input: unknown): string[] {
  const tags = Array.isArray(input) ? input : []
  return tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50)
}

function getAuthKey(request: NextRequest): string {
  return (
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
}

async function resolveUser(request: NextRequest): Promise<
  | { ok: true; userId: string; mode: 'admin' | 'session' }
  | { ok: false; status: number; error: string }
> {
  const rawKey = getAuthKey(request)
  if (rawKey) {
    const auth = await requireAutomationKey(request)
    if (!auth.ok) return { ok: false, status: 401, error: auth.error }
    return { ok: true, userId: auth.userId, mode: 'admin' }
  }

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true, userId: session.user.id, mode: 'session' }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const includeUsedIn = request.nextUrl.searchParams.get('includeUsedIn') === '1'

  const auth = await resolveUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const db = auth.mode === 'admin' ? createAdminClient() : createClient()
  if (!db) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { data: asset, error } = await db
    .from('assets')
    .select('id, user_id, type, title, content, source_platform, source_url, meta, tags, created_at, updated_at')
    .eq('id', params.id)
    .eq('user_id', auth.userId)
    .single()

  if (error || !asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!includeUsedIn) {
    return NextResponse.json({ ok: true, asset })
  }

  // Used in: via post_assets → posts
  const { data: links, error: linksError } = await db
    .from('post_assets')
    .select('post_id, created_at')
    .eq('asset_id', params.id)
    .order('created_at', { ascending: false })

  if (linksError) {
    return NextResponse.json({ ok: true, asset, usedIn: [] })
  }

  const postIds = (links || []).map((l: any) => l.post_id).filter(Boolean)
  if (!postIds.length) {
    return NextResponse.json({ ok: true, asset, usedIn: [] })
  }

  const { data: posts } = await db
    .from('posts')
    .select('id, title, slug, status, published_at, created_at')
    .in('id', postIds)
    .eq('author_id', auth.userId)

  const postById = new Map((posts || []).map((p: any) => [p.id, p]))
  const usedIn = (links || [])
    .map((l: any) => {
      const p = postById.get(l.post_id)
      if (!p) return null
      return { post: p, linked_at: l.created_at }
    })
    .filter(Boolean)

  return NextResponse.json({ ok: true, asset, usedIn })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await resolveUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => null)) as PatchBody | null

  const patch: Record<string, any> = {}

  if (typeof body?.type === 'string') {
    if (!ALLOWED_TYPES.includes(body.type as AssetType)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    patch.type = body.type
  }

  if (typeof body?.title === 'string' || body?.title === null) {
    patch.title = typeof body.title === 'string' ? body.title : null
  }

  if (typeof body?.content === 'string') {
    const c = body.content.trim()
    if (!c) return NextResponse.json({ error: 'content is required' }, { status: 400 })
    patch.content = c
  }

  if (body?.tags !== undefined) {
    patch.tags = normalizeTags(body.tags)
  }

  if (body?.meta !== undefined) {
    if (body.meta && typeof body.meta === 'object') {
      patch.meta = body.meta
    } else if (body.meta === null) {
      patch.meta = {}
    } else {
      return NextResponse.json({ error: 'meta must be an object' }, { status: 400 })
    }
  }

  if (typeof body?.source_platform === 'string' || body?.source_platform === null) {
    patch.source_platform = typeof body.source_platform === 'string' ? body.source_platform : null
  }

  if (typeof body?.source_url === 'string' || body?.source_url === null) {
    patch.source_url = typeof body.source_url === 'string' ? body.source_url : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()

  const db = auth.mode === 'admin' ? createAdminClient() : createClient()
  if (!db) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { data, error } = await db
    .from('assets')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', auth.userId)
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to update asset.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await resolveUser(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const db = auth.mode === 'admin' ? createAdminClient() : createClient()
  if (!db) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { error } = await db
    .from('assets')
    .delete()
    .eq('id', params.id)
    .eq('user_id', auth.userId)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete asset.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
