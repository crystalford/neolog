import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const access_key_id = typeof body.access_key_id === 'string' ? body.access_key_id.trim() : ''
    const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : ''
    const region = typeof body.region === 'string' ? body.region.trim() : ''
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
    const public_base_url = typeof body.public_base_url === 'string' ? body.public_base_url.trim() : ''

    finalMeta = {
      user_id: session.user.id,
      provider: provider || null,
      has_access_key_id: Boolean(access_key_id),
      has_bucket: Boolean(bucket),
      has_region: Boolean(region),
      has_endpoint: Boolean(endpoint),
      has_public_base_url: Boolean(public_base_url),
    }

    try {
      const run = await startJobRun('storage.save', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!provider || !access_key_id || !bucket) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'provider, access_key_id, and bucket are required.' }, { status: 400 })
    }

    const payload = {
      user_id: session.user.id,
      provider,
      access_key_id,
      bucket,
      region: region || null,
      endpoint: endpoint || null,
      public_base_url: public_base_url || null,
      is_active: true,
    }

    const { data: saved, error } = await supabase
      .from('storage_connections')
      .upsert(payload, { onConflict: 'user_id,provider' })
      .select('id')
      .single()

    if (error) {
      finalErrorMessage = 'Failed to save storage config.'
      return NextResponse.json({ error: 'Failed to save storage config.' }, { status: 500 })
    }

    if (saved?.id) {
      await supabase
        .from('storage_connections')
        .update({ is_active: false })
        .eq('user_id', session.user.id)
        .neq('id', saved.id)

      await supabase
        .from('storage_connections')
        .update({ is_active: true })
        .eq('id', saved.id)
    }

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to save storage config.'
    return NextResponse.json({ error: 'Failed to save storage config.' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
