import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type {
  ProjectDocumentDecision,
  ProjectDocumentActionItem,
  ProjectDocumentRoadmapItem,
  ProjectDocumentSnapshot,
} from '@/types/database'

export type DeltaChange =
  | { type: 'new_decision';        decision: ProjectDocumentDecision }
  | { type: 'decision_status';     decision: ProjectDocumentDecision; prev_status: string | null }
  | { type: 'new_action_item';     item: ProjectDocumentActionItem }
  | { type: 'action_item_done';    item: ProjectDocumentActionItem }
  | { type: 'new_roadmap_item';    item: ProjectDocumentRoadmapItem }
  | { type: 'roadmap_status';      item: ProjectDocumentRoadmapItem; prev_status: string }

export type DeltaResponse = {
  has_changes: boolean
  snapshot_date: string | null
  snapshot_mention_count: number | null
  current_mention_count: number | null
  changes: DeltaChange[]
}

// GET /api/project-documents/[slug]/delta
// Returns a deterministic diff between the latest synthesis and the previous snapshot
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = params

  const { data: entity } = await supabase
    .from('entities')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('type', 'project')
    .eq('slug', slug)
    .single()

  if (!entity) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: doc } = await supabase
    .from('project_documents')
    .select('decisions_log, action_items, roadmap, mention_count_at_synthesis, synthesis_history')
    .eq('entity_id', entity.id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'No document yet' }, { status: 404 })

  const history: ProjectDocumentSnapshot[] = doc.synthesis_history || []
  if (history.length === 0) {
    return NextResponse.json({ has_changes: false, snapshot_date: null, snapshot_mention_count: null, current_mention_count: doc.mention_count_at_synthesis, changes: [] } satisfies DeltaResponse)
  }

  const prev = history[history.length - 1]
  const curr = {
    decisions_log: (doc.decisions_log || []) as ProjectDocumentDecision[],
    action_items: (doc.action_items || []) as ProjectDocumentActionItem[],
    roadmap: (doc.roadmap || []) as ProjectDocumentRoadmapItem[],
  }

  const changes: DeltaChange[] = []

  // New decisions + decision status changes
  for (const d of curr.decisions_log) {
    const prev_d = (prev.decisions_log as ProjectDocumentDecision[]).find(
      p => p.decision.toLowerCase() === d.decision.toLowerCase()
    )
    if (!prev_d) {
      changes.push({ type: 'new_decision', decision: d })
    } else if (prev_d.status !== d.status && d.status !== null) {
      changes.push({ type: 'decision_status', decision: d, prev_status: prev_d.status })
    }
  }

  // Action items: new + completed
  for (const a of curr.action_items) {
    const prev_a = (prev.action_items as ProjectDocumentActionItem[]).find(
      p => p.item.toLowerCase() === a.item.toLowerCase()
    )
    if (!prev_a) {
      changes.push({ type: 'new_action_item', item: a })
    } else if (prev_a.status === 'open' && a.status === 'done') {
      changes.push({ type: 'action_item_done', item: a })
    }
  }

  // Roadmap: new items + status changes
  for (const r of curr.roadmap) {
    const prev_r = (prev.roadmap as ProjectDocumentRoadmapItem[]).find(
      p => p.item.toLowerCase() === r.item.toLowerCase()
    )
    if (!prev_r) {
      changes.push({ type: 'new_roadmap_item', item: r })
    } else if (prev_r.status !== r.status) {
      changes.push({ type: 'roadmap_status', item: r, prev_status: prev_r.status })
    }
  }

  return NextResponse.json({
    has_changes: changes.length > 0,
    snapshot_date: prev.synthesized_at,
    snapshot_mention_count: prev.mention_count,
    current_mention_count: doc.mention_count_at_synthesis,
    changes,
  } satisfies DeltaResponse)
}
