/**
 * GET /api/upload/resume?uploadId=X&key=Y&fromPart=N
 *
 * Returns fresh presigned PUT URLs for parts starting from `fromPart`.
 * Used when resuming an interrupted upload — the client already has ETags
 * for earlier parts stored in localStorage.
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { presignResumeParts } from '@/lib/storage/r2'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const uploadId = searchParams.get('uploadId')
  const key = searchParams.get('key')
  const fromPart = parseInt(searchParams.get('fromPart') ?? '1', 10)
  const totalParts = parseInt(searchParams.get('totalParts') ?? '0', 10)

  if (!uploadId || !key || !totalParts) {
    return NextResponse.json({ error: 'uploadId, key, totalParts required' }, { status: 400 })
  }

  // Verify the key belongs to this user
  if (!key.startsWith(`${session.user.id}/`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const partNumbers = Array.from(
    { length: totalParts - fromPart + 1 },
    (_, i) => fromPart + i
  )

  try {
    const partUrls = await presignResumeParts(key, uploadId, partNumbers)
    return NextResponse.json({ partUrls, fromPart })
  } catch (err: any) {
    console.error('[upload/resume]', err.message)
    return NextResponse.json({ error: 'Failed to generate resume URLs' }, { status: 500 })
  }
}
