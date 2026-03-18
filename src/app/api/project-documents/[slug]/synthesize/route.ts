import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'
import { NextResponse } from 'next/server'

// POST /api/project-documents/[slug]/synthesize
// Triggers the synthesize-project Inngest function
export async function POST(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = params

  const { data: entity } = await supabase
    .from('entities')
    .select('id, mention_count')
    .eq('user_id', session.user.id)
    .eq('type', 'project')
    .eq('slug', slug)
    .single()

  if (!entity) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  await inngest.send({
    name: 'app/project.synthesize',
    data: { entity_id: entity.id, user_id: session.user.id },
  })

  return NextResponse.json({ ok: true, mention_count: entity.mention_count })
}
