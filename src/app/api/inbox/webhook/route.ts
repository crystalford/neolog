import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAutomationKey } from '@/lib/apiKeyAuth'

export async function POST(request: NextRequest) {
  const auth = await requireAutomationKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))

  const sourceType = typeof body.sourceType === 'string' ? body.sourceType : 'webhook'
  const title = typeof body.title === 'string' ? body.title : null
  const canonicalUrl = typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : null
  const rawData = body.rawData && typeof body.rawData === 'object' ? body.rawData : {}

  const { data, error } = await admin
    .from('inbox_items')
    .insert({
      user_id: auth.userId,
      source_type: sourceType,
      title,
      canonical_url: canonicalUrl,
      source_url: sourceUrl,
      raw_data: rawData,
      status: 'new',
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
