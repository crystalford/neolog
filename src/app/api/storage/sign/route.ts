export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveIntegrationKeyWithClient } from '@/lib/integrations'
import { presignS3Url } from '@/lib/storage/presign'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const sanitizeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

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
    const filename = typeof body.filename === 'string' ? body.filename : ''
    const contentType = typeof body.contentType === 'string' ? body.contentType : ''

    finalMeta = {
      user_id: session.user.id,
      filename_len: filename.length,
      has_content_type: Boolean(contentType),
    }

    try {
      const run = await startJobRun('storage.sign', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!filename) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'bad_request' }
      return NextResponse.json({ error: 'filename is required.' }, { status: 400 })
    }

    const { data: connection, error } = await supabase
      .from('storage_connections')
      .select('provider, access_key_id, bucket, region, endpoint, public_base_url')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !connection) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'not_configured' }
      return NextResponse.json({ error: 'Storage connection not configured.' }, { status: 400 })
    }

    finalMeta = { ...finalMeta, provider: connection.provider || null }

    const secretKey = await getActiveIntegrationKeyWithClient(supabase as any, session.user.id, connection.provider)
    if (!secretKey) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_secret_key' }
      return NextResponse.json({ error: 'Storage secret key not configured.' }, { status: 400 })
    }

  const region = connection.region || (connection.provider === 'r2' ? 'auto' : 'us-east-1')
  const endpoint = connection.endpoint
    ? connection.endpoint
    : connection.provider === 's3'
      ? `https://s3.${region}.amazonaws.com`
      : ''

    if (!endpoint) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'missing_endpoint' }
      return NextResponse.json({ error: 'Storage endpoint required.' }, { status: 400 })
    }

  const safeName = sanitizeName(filename)
  const key = `uploads/${session.user.id}/${Date.now()}-${safeName}`

  const uploadUrl = await presignS3Url({
    accessKeyId: connection.access_key_id,
    secretKey,
    bucket: connection.bucket,
    key,
    region,
    endpoint,
  })

  const publicUrl = connection.public_base_url
    ? `${connection.public_base_url.replace(/\/$/, '')}/${key}`
    : connection.provider === 's3'
      ? `https://${connection.bucket}.s3.${region}.amazonaws.com/${key}`
      : `${endpoint.replace(/\/$/, '')}/${connection.bucket}/${key}`

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json({
      uploadUrl,
      key,
      contentType,
      publicUrl,
    })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to sign upload URL.'
    return NextResponse.json({ error: 'Failed to sign upload URL.' }, { status: 500 })
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
