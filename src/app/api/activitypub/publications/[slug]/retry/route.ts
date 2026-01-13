import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignedActivityForPublication } from '@/lib/activitypub-outbound'

const RETRY_MINUTES = [5, 15, 60, 240, 720]

export async function POST(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { data: publication } = await admin
    .from('publications')
    .select('id, slug')
    .eq('slug', params.slug)
    .eq('owner_id', session.user.id)
    .maybeSingle()

  if (!publication) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
  }

  const now = new Date()
  const { data: deliveries } = await admin
    .from('activitypub_publication_deliveries')
    .select('id, inbox_url, payload, attempt_count')
    .eq('publication_id', publication.id)
    .eq('status', 'failed')
    .order('last_attempt_at', { ascending: true })
    .limit(20)

  if (!deliveries || deliveries.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0, delivered: 0 })
  }

  let deliveredCount = 0

  for (const delivery of deliveries) {
    const attempt = (delivery.attempt_count || 0) + 1
    const retryDelay = RETRY_MINUTES[Math.min(attempt - 1, RETRY_MINUTES.length - 1)]
    const nextRetryAt = new Date(now.getTime() + retryDelay * 60 * 1000).toISOString()

    const result = await sendSignedActivityForPublication(
      publication.id,
      publication.slug,
      delivery.inbox_url,
      delivery.payload as Record<string, unknown>
    )

    if (result.ok) {
      deliveredCount += 1
    }

    await admin
      .from('activitypub_publication_deliveries')
      .update({
        status: result.ok ? 'sent' : 'failed',
        attempt_count: attempt,
        last_attempt_at: now.toISOString(),
        next_attempt_at: result.ok ? null : nextRetryAt,
        last_error: result.error,
        response_status: result.status || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
  }

  return NextResponse.json({
    ok: true,
    attempted: deliveries.length,
    delivered: deliveredCount,
  })
}
