import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignedActivity, sendSignedActivityForPublication } from '@/lib/activitypub-outbound'

const RETRY_MINUTES = [5, 15, 60, 240, 720]

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const now = new Date()

  const { data: deliveries } = await admin
    .from('activitypub_deliveries')
    .select('id, user_id, inbox_url, payload, attempt_count')
    .eq('status', 'failed')
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(50)

  const { data: publicationDeliveries } = await admin
    .from('activitypub_publication_deliveries')
    .select('id, publication_id, inbox_url, payload, attempt_count')
    .eq('status', 'failed')
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(50)

  const deliveryRows = deliveries || []
  const publicationRows = publicationDeliveries || []

  if (deliveryRows.length === 0 && publicationRows.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0, delivered: 0 })
  }

  const userIds = Array.from(new Set(deliveryRows.map((d) => d.user_id)))
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  const usernameMap = new Map((profiles || []).map((p) => [p.id, p.username]))

  const publicationIds = Array.from(new Set(publicationRows.map((d) => d.publication_id)))
  const { data: publications } = await admin
    .from('publications')
    .select('id, slug')
    .in('id', publicationIds)

  const publicationMap = new Map((publications || []).map((p) => [p.id, p.slug]))

  let deliveredCount = 0

  for (const delivery of deliveryRows) {
    const username = usernameMap.get(delivery.user_id)
    if (!username) {
      continue
    }

    const attempt = (delivery.attempt_count || 0) + 1
    const retryDelay = RETRY_MINUTES[Math.min(attempt - 1, RETRY_MINUTES.length - 1)]
    const nextRetryAt = new Date(now.getTime() + retryDelay * 60 * 1000).toISOString()

    const result = await sendSignedActivity(
      delivery.user_id,
      username,
      delivery.inbox_url,
      delivery.payload as Record<string, unknown>
    )

    if (result.ok) {
      deliveredCount += 1
    }

    await admin
      .from('activitypub_deliveries')
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

  for (const delivery of publicationRows) {
    const publicationSlug = publicationMap.get(delivery.publication_id)
    if (!publicationSlug) {
      continue
    }

    const attempt = (delivery.attempt_count || 0) + 1
    const retryDelay = RETRY_MINUTES[Math.min(attempt - 1, RETRY_MINUTES.length - 1)]
    const nextRetryAt = new Date(now.getTime() + retryDelay * 60 * 1000).toISOString()

    const result = await sendSignedActivityForPublication(
      delivery.publication_id,
      publicationSlug,
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
    attempted: deliveryRows.length + publicationRows.length,
    delivered: deliveredCount,
  })
}
