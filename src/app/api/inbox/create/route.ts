import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const sourceType = typeof body.sourceType === 'string' ? body.sourceType : 'manual'
  const title = typeof body.title === 'string' ? body.title : null
  const canonicalUrl = typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : null
  const rawData = body.rawData && typeof body.rawData === 'object' ? body.rawData : {}

  const { data, error } = await supabase
    .from('inbox_items')
    .insert({
      user_id: session.user.id,
      source_type: sourceType,
      title,
      canonical_url: canonicalUrl,
      source_url: sourceUrl,
      raw_data: rawData,
      status: 'new',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
