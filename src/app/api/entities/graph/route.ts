import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user_id = session.user.id

  // 1. Fetch all active entities (nodes)
  const { data: entities, error: entityError } = await supabase
    .from('entities')
    .select('id, name, type, mention_count, status')
    .eq('user_id', user_id)
    .order('mention_count', { ascending: false })
    .limit(100)

  if (entityError) {
    return NextResponse.json({ error: entityError.message }, { status: 500 })
  }

  // 2. Derive edges via shared mentions
  // We want to find pairs of entities that appear in the same video_upload_id or log_entry_id
  const { data: mentions, error: mentionError } = await supabase
    .from('entity_mentions')
    .select('entity_id, video_upload_id, log_entry_id')
    .in('entity_id', entities.map(e => e.id))

  if (mentionError) {
    return NextResponse.json({ error: mentionError.message }, { status: 500 })
  }

  // Group mentions by source (video or log)
  const sourceToEntities: Record<string, Set<string>> = {}
  mentions.forEach(m => {
    const sourceId = m.video_upload_id || m.log_entry_id
    if (!sourceId) return
    if (!sourceToEntities[sourceId]) sourceToEntities[sourceId] = new Set()
    sourceToEntities[sourceId].add(m.entity_id)
  })

  // Count shared occurrences
  const edgeCounts: Record<string, number> = {}
  Object.values(sourceToEntities).forEach(entitySet => {
    const arr = Array.from(entitySet)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const [a, b] = [arr[i], arr[j]].sort()
        const key = `${a}::${b}`
        edgeCounts[key] = (edgeCounts[key] || 0) + 1
      }
    }
  })

  const edges = Object.entries(edgeCounts).map(([key, value]) => {
    const [source, target] = key.split('::')
    return { source, target, value }
  })

  return NextResponse.json({
    nodes: entities,
    links: edges
  })
}
