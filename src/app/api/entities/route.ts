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
      return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 })
    }

    // Also get counts by type for the filter tabs
    const { data: typeCounts } = await supabase
      .rpc('get_entity_type_counts', { p_user_id: session.user.id })
      .select('*')

    return NextResponse.json({
      entities: data || [],
      type_counts: typeCounts || [],
    })
  } catch (err: any) {
    console.error('Fetch logs error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch logs' }, { status: 500 })
  }
}
