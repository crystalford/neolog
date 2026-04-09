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

  const { id } = params
  if (!id) {
    return NextResponse.json({ error: 'Missing entity ID' }, { status: 400 })
  }

  // Trigger project-specific synthesis
  // This function aggregates all logs/uploads mentioning this project and writes a narrative to project_documents
  await inngest.send({
    name: 'app/project.synthesize',
    data: { 
      entity_id: id,
      user_id: session.user.id 
    },
  })

  return NextResponse.json({ queued: true })
}
