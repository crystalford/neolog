import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  // Compatibility alias for external clients expecting /api/v1/capture.
  // Internally, Neolog’s capture endpoint is /api/capture.
  const forwardUrl = new URL('/api/capture', request.url)

  const headers = new Headers(request.headers)
  // Ensure fetch can compute this correctly.
  headers.delete('content-length')
  // Prevent double job_runs logging (this route + /api/capture).
  headers.set('x-neolog-skip-job-run', '1')

  const rawKey =
    request.headers.get('x-api-key') ||
    request.headers.get('x-neolog-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''

  finalMeta = {
    forwarded_to: '/api/capture',
    has_automation_key: Boolean(rawKey.trim()),
  }

  try {
    try {
      const run = await startJobRun('capture.v1', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

  const bodyText = await request.text()

  const response = await fetch(forwardUrl, {
    method: 'POST',
    headers,
    body: bodyText,
  })

  const data = (await response.json().catch(() => null)) as any

  if (!response.ok) {
    finalErrorMessage = typeof data?.error === 'string' ? data.error : 'Capture failed.'
    return NextResponse.json(data ?? { error: 'Capture failed.' }, { status: response.status })
  }

  const assetId = typeof data?.id === 'string' ? data.id : null
  if (!assetId) {
    finalErrorMessage = 'Capture succeeded but returned no asset id.'
    return NextResponse.json({ error: 'Capture succeeded but returned no asset id.' }, { status: 500 })
  }

  finalStatus = 'success'
  finalMeta = {
    ...finalMeta,
    asset_id: assetId,
  }

  const origin = request.nextUrl.origin
  return NextResponse.json(
    {
      asset_id: assetId,
      vault_url: `${origin}/vault/${assetId}`,
    },
    { status: 201 },
  )
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
