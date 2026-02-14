import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/entities/[id]
 *
 * Get a single entity with all its mentions across recording sessions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: entity, error } = await supabase
      .from('entities')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single()

    if (error || !entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Get all mentions with the recording they came from
    const { data: mentions } = await supabase
      .from('entity_mentions')
      .select(`
        id,
        context,
        sentiment,
        created_at,
        video_upload_id,
        video_uploads (
          id,
          file_name,
          created_at
        )
      `)
      .eq('entity_id', params.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      entity,
      mentions: mentions || [],
    })
  } catch (error) {
    console.error('Get entity error:', error)
    return NextResponse.json({ error: 'Failed to fetch entity' }, { status: 500 })
  }
}
