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
