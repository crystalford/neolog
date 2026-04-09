import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export const runtime = 'edge'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = params.id
  const user_id = session.user.id

  // 1. Verify the entity exists and belongs to the user
  const { data: entity, error } = await supabase
    .from('entities')
    .select('id, name')
    .eq('id', projectId)
    .eq('user_id', user_id)
    .single()

  if (error || !entity) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // 2. Trigger Inngest synthesis
  await inngest.send({
    name: 'app/project.synthesize',
    data: {
      entity_id: projectId,
      user_id: user_id
    }
  })

  return NextResponse.json({ queued: true })
}
