import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { EditPlan } from '@/types/database'

type Params = { params: { id: string } }

// GET /api/clip-sessions/[id]/download?plan_id=xxx
// Returns a short-lived signed URL to download an assembled clip
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const planId = request.nextUrl.searchParams.get('plan_id')
    if (!planId) return NextResponse.json({ error: 'plan_id required' }, { status: 400 })

    const { data: clipSession, error } = await supabase
      .from('clip_sessions')
      .select('edit_plans')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single()

    if (error || !clipSession) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const plans = (clipSession.edit_plans as EditPlan[]) || []
    const plan = plans.find(p => p.id === planId)
    if (!plan) return NextResponse.json({ error: 'Edit plan not found' }, { status: 404 })
    if (!plan.assembled_storage_path) {
      return NextResponse.json({ error: 'Video not yet assembled' }, { status: 400 })
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('videos')
      .createSignedUrl(plan.assembled_storage_path, 3600) // 1hr

    if (signedError || !signedData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
    }

    return NextResponse.json({ url: signedData.signedUrl, title: plan.title })
  } catch {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }
}
