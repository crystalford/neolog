import { NextRequest, NextResponse } from 'next/server'

import { requireAutomationKey } from '@/lib/apiKeyAuth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAutomationKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const body = (await request.json().catch(() => null)) as
    | {
        postId?: string
        title?: string
        excerpt?: string
        content?: string
        content_html?: string
        content_type?: 'markdown' | 'html' | 'rich' | 'pulse'
      }
    | null

  if (!body?.postId) {
    return NextResponse.json({ error: 'postId is required.' }, { status: 400 })
  }

  const patch: Record<string, any> = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.excerpt === 'string') patch.excerpt = body.excerpt
  if (typeof body.content === 'string') patch.content = body.content
  if (typeof body.content_html === 'string') patch.content_html = body.content_html
  if (typeof body.content_type === 'string') patch.content_type = body.content_type

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()

  const { data: post, error: postError } = await admin
    .from('posts')
    .select('id, author_id, status')
    .eq('id', body.postId)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
  }

  if (post.author_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  if (post.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft posts can be updated.' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await admin
    .from('posts')
    .update(patch)
    .eq('id', body.postId)
    .select('id, slug, status, updated_at')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Failed to update post.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, post: updated })
}
