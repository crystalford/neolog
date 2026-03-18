import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/project-documents/[slug]
// Returns the entity + its project_document + all entity_mentions with source info
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = params

  // Fetch entity
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('id, name, slug, type, status, metadata, mention_count, first_mentioned_at, last_mentioned_at')
    .eq('user_id', session.user.id)
    .eq('type', 'project')
    .eq('slug', slug)
    .single()

  if (entityError || !entity) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Fetch document and mentions in parallel
  const [documentRes, mentionsRes] = await Promise.all([
    supabase
      .from('project_documents')
      .select('*')
      .eq('entity_id', entity.id)
      .maybeSingle(),
    supabase
      .from('entity_mentions')
      .select('id, context, full_context, sentiment, created_at, source_type, video_upload_id, video_uploads(id, file_name, recorded_at, created_at, duration_seconds)')
      .eq('entity_id', entity.id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    entity,
    document: documentRes.data || null,
    mentions: mentionsRes.data || [],
  })
}

// PATCH /api/project-documents/[slug]
// Updates user-editable fields: manual_notes, project_type
export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = params
  const body = await req.json()
  const { manual_notes, project_type } = body

  // Get entity id
  const { data: entity } = await supabase
    .from('entities')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('type', 'project')
    .eq('slug', slug)
    .single()

  if (!entity) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (manual_notes !== undefined) updates.manual_notes = manual_notes
  if (project_type !== undefined) updates.project_type = project_type

  // Upsert (document may not exist yet)
  const { error } = await supabase
    .from('project_documents')
    .upsert(
      { user_id: session.user.id, entity_id: entity.id, ...updates },
      { onConflict: 'entity_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
