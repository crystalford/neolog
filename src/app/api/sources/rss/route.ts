import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name : null
  const url = typeof body.url === 'string' ? body.url.trim() : ''

  if (!url) {
    return NextResponse.json({ error: 'RSS URL is required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('feed_sources')
    .insert({
      user_id: session.user.id,
      source_type: 'rss',
      name,
      url,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to add source.' }, { status: 500 })
  }

  return NextResponse.json({ source: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const id = typeof body.id === 'string' ? body.id : ''

  if (!id) {
    return NextResponse.json({ error: 'Source id is required.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('feed_sources')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to remove source.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: string; publicationId?: string | null; autoConvertToDrafts?: boolean }
    | null

  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) {
    return NextResponse.json({ error: 'Source id is required.' }, { status: 400 })
  }

  const autoConvertToDrafts = typeof body?.autoConvertToDrafts === 'boolean' ? body.autoConvertToDrafts : null
  const publicationId =
    body?.publicationId === null ? null : typeof body?.publicationId === 'string' ? body.publicationId : undefined

  if (publicationId !== undefined && publicationId) {
    const { data: pub } = await supabase
      .from('publications')
      .select('id')
      .eq('id', publicationId)
      .eq('owner_id', session.user.id)
      .maybeSingle()

    if (!pub) {
      return NextResponse.json({ error: 'Invalid publication.' }, { status: 400 })
    }
  }

  const update: any = {}
  if (publicationId !== undefined) update.publication_id = publicationId
  if (autoConvertToDrafts !== null) update.auto_convert_to_drafts = autoConvertToDrafts

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No changes provided.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('feed_sources')
    .update(update)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select('*')
    .single()

  if (error || !data) {
    const msg = String(error?.message || '')
    if (msg.includes('publication_id') || msg.includes('auto_convert_to_drafts')) {
      return NextResponse.json(
        { error: 'Feed source settings not available. Apply the latest Supabase migrations.' },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: 'Failed to update source.' }, { status: 500 })
  }

  return NextResponse.json({ source: data })
}
