export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/entities
 *
 * List the user's accumulated entities across all recording sessions.
 * Supports filtering by type and sorting by mention count or recency.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const sort = searchParams.get('sort') || 'mentions' // mentions | recent | oldest
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('q')

    let query = supabase
      .from('entities')
      .select('*')
      .eq('user_id', session.user.id)
      .range(offset, offset + limit - 1)

    if (type) {
      query = query.eq('type', type)
    }

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    switch (sort) {
      case 'recent':
        query = query.order('last_mentioned_at', { ascending: false })
        break
      case 'oldest':
        query = query.order('first_mentioned_at', { ascending: true })
        break
      case 'mentions':
      default:
        query = query.order('mention_count', { ascending: false })
        break
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get counts by type for the filter tabs (direct query, no RPC needed)
    const { data: allTypes } = await supabase
      .from('entities')
      .select('type')
      .eq('user_id', session.user.id)

    const typeCountMap: Record<string, number> = {}
    for (const row of (allTypes || [])) {
      typeCountMap[row.type] = (typeCountMap[row.type] || 0) + 1
    }
    const typeCounts = Object.entries(typeCountMap).map(([type, count]) => ({ type, count }))

    return NextResponse.json({
      entities: data || [],
      type_counts: typeCounts,
    })
  } catch (err: any) {
    console.error('List entities error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch entities' }, { status: 500 })
  }
}
