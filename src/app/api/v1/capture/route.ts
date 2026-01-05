import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Compatibility alias for external clients expecting /api/v1/capture.
  // Internally, Neolog’s capture endpoint is /api/capture.
  const forwardUrl = new URL('/api/capture', request.url)

  const headers = new Headers(request.headers)
  // Ensure fetch can compute this correctly.
  headers.delete('content-length')

  const bodyText = await request.text()

  const response = await fetch(forwardUrl, {
    method: 'POST',
    headers,
    body: bodyText,
  })

  const data = (await response.json().catch(() => null)) as any

  if (!response.ok) {
    return NextResponse.json(data ?? { error: 'Capture failed.' }, { status: response.status })
  }

  const assetId = typeof data?.id === 'string' ? data.id : null
  if (!assetId) {
    return NextResponse.json({ error: 'Capture succeeded but returned no asset id.' }, { status: 500 })
  }

  const origin = request.nextUrl.origin
  return NextResponse.json(
    {
      asset_id: assetId,
      vault_url: `${origin}/vault/${assetId}`,
    },
    { status: 201 },
  )
}
