import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const hashKey = (key: string) =>
  crypto.createHash('sha256').update(key).digest('hex')

export async function POST(request: NextRequest, { params }: { params: { key: string } }) {
  const supabase = createClient()
  const keyHash = hashKey(params.key || '')

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .single()

  if (!apiKey) {
    return NextResponse.json({ error: 'Invalid key.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title : null
  const contentHtml = typeof body.content_html === 'string' ? body.content_html : ''
  const canonicalUrl = typeof body.canonical_url === 'string' ? body.canonical_url : null
  const sourceType = typeof body.source_type === 'string' ? body.source_type : 'webhook'
  const sourceUrl = typeof body.source_url === 'string' ? body.source_url : null

  const { error } = await supabase
    .from('inbox_items')
    .insert({
      user_id: apiKey.user_id,
      source_type: sourceType,
      source_url: sourceUrl,
      title,
      canonical_url: canonicalUrl,
      raw_data: {
        title,
        content_html: contentHtml,
      },
      status: 'new',
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
  }

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)

  return NextResponse.json({ ok: true })
}
