import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const hashKey = (key: string) =>
  crypto.createHash('sha256').update(key).digest('hex')

export async function POST(request: NextRequest, { params }: { params: { key: string } }) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

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

  try {
    const body = await request.json().catch(() => ({}))
    const title = typeof (body as any).title === 'string' ? (body as any).title : null
    const contentHtml = typeof (body as any).content_html === 'string' ? (body as any).content_html : ''
    const canonicalUrl = typeof (body as any).canonical_url === 'string' ? (body as any).canonical_url : null
    const sourceType = typeof (body as any).source_type === 'string' ? (body as any).source_type : 'webhook'
    const sourceUrl = typeof (body as any).source_url === 'string' ? (body as any).source_url : null

    finalMeta = {
      user_id: apiKey.user_id,
      api_key_id: apiKey.id,
      source_type: sourceType,
      title_len: typeof title === 'string' ? title.length : null,
      content_html_len: contentHtml.length,
      has_canonical_url: Boolean(canonicalUrl),
      has_source_url: Boolean(sourceUrl),
    }
    try {
      const run = await startJobRun('inbox.v1.key_create', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

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
    finalErrorMessage = 'Failed to create inbox item.'
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
  }

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)

    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success' }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Failed to create inbox item.'
    return NextResponse.json({ error: 'Failed to create inbox item.' }, { status: 500 })
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
