import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type {
  ProjectDocument,
  ProjectDocumentDecision,
  ProjectDocumentActionItem,
  ProjectDocumentRoadmapItem,
} from '@/types/database'

// GET /api/project-documents/[slug]/export?format=markdown|notion|linear
export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || 'markdown'

  // Fetch entity
  const { data: entity } = await supabase
    .from('entities')
    .select('id, name, slug, status, mention_count, first_mentioned_at, last_mentioned_at')
    .eq('user_id', session.user.id)
    .eq('type', 'project')
    .eq('slug', slug)
    .single()

  if (!entity) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: doc } = await supabase
    .from('project_documents')
    .select('*')
    .eq('entity_id', entity.id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'No document generated yet' }, { status: 404 })

  const exportedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  if (format === 'linear') {
    return exportLinear(doc, entity.name, exportedAt)
  }

  // markdown and notion both produce markdown (Notion accepts paste of markdown)
  return exportMarkdown(doc, entity, exportedAt)
}

function exportMarkdown(doc: ProjectDocument, entity: any, exportedAt: string): Response {
  const lines: string[] = []

  lines.push(`# ${entity.name}`)
  lines.push(``)
  lines.push(`> Exported from Neolog on ${exportedAt}`)
  if (doc.last_synthesized_at) {
    lines.push(`> Last synthesized: ${new Date(doc.last_synthesized_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`)
  }
  lines.push(``)

  if (doc.overview) {
    lines.push(`## Overview`)
    lines.push(``)
    lines.push(doc.overview)
    lines.push(``)
  }

  if (doc.origin_story) {
    lines.push(`## Origin Story`)
    lines.push(``)
    lines.push(doc.origin_story)
    lines.push(``)
  }

  if (doc.narrative_overview) {
    lines.push(`## Narrative Arc`)
    lines.push(``)
    lines.push(doc.narrative_overview)
    lines.push(``)
  }

  if (doc.technical_notes) {
    lines.push(`## Technical Notes`)
    lines.push(``)
    lines.push(doc.technical_notes)
    lines.push(``)
  }

  const decisions = (doc.decisions_log || []) as ProjectDocumentDecision[]
  if (decisions.length > 0) {
    lines.push(`## Decisions Log`)
    lines.push(``)
    for (const d of decisions) {
      const status = d.status && d.status !== 'made' ? ` \`${d.status.toUpperCase()}\`` : ''
      lines.push(`### ${d.decision}${status}`)
      if (d.reasoning) lines.push(`*${d.reasoning}*`)
      if (d.lifecycle_note) lines.push(`> ${d.lifecycle_note}`)
      const meta: string[] = []
      if (d.date) meta.push(d.date)
      if (d.source_upload_id && d.source_timestamp_seconds != null) {
        const m = Math.floor(d.source_timestamp_seconds / 60)
        const s = Math.floor(d.source_timestamp_seconds % 60)
        meta.push(`[source clip ${m}:${s.toString().padStart(2, '0')}](/dashboard/timeline/${d.source_upload_id}?t=${Math.floor(d.source_timestamp_seconds)})`)
      }
      if (meta.length > 0) lines.push(`— ${meta.join(' · ')}`)
      lines.push(``)
    }
  }

  const actionItems = (doc.action_items || []) as ProjectDocumentActionItem[]
  if (actionItems.length > 0) {
    lines.push(`## Action Items`)
    lines.push(``)
    for (const a of actionItems) {
      const check = a.status === 'done' ? '[x]' : '[ ]'
      let line = `- ${check} ${a.item}`
      if (a.source_upload_id && a.source_timestamp_seconds != null) {
        const m = Math.floor(a.source_timestamp_seconds / 60)
        const s = Math.floor(a.source_timestamp_seconds % 60)
        line += ` ([${m}:${s.toString().padStart(2, '0')}](/dashboard/timeline/${a.source_upload_id}?t=${Math.floor(a.source_timestamp_seconds)}))`
      }
      lines.push(line)
    }
    lines.push(``)
  }

  const roadmap = (doc.roadmap || []) as ProjectDocumentRoadmapItem[]
  if (roadmap.length > 0) {
    lines.push(`## Roadmap`)
    lines.push(``)
    for (const r of roadmap) {
      const status = r.status === 'done' ? '~~' : ''
      lines.push(`- \`${r.priority.toUpperCase()}\` ${status}${r.item}${status} — *${r.status}*`)
    }
    lines.push(``)
  }

  if (doc.manual_notes) {
    lines.push(`## Notes`)
    lines.push(``)
    lines.push(doc.manual_notes)
    lines.push(``)
  }

  const md = lines.join('\n')
  return new Response(md, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${entity.slug}.md"`,
    },
  })
}

function exportLinear(doc: ProjectDocument, projectName: string, exportedAt: string): Response {
  const rows: string[][] = [
    ['Title', 'Status', 'Priority', 'Description', 'Source Timestamp'],
  ]

  const actionItems = (doc.action_items || []) as ProjectDocumentActionItem[]
  for (const a of actionItems) {
    const priority = '' // Linear priority assigned manually
    const status = a.status === 'done' ? 'Done' : 'Todo'
    const sourceRef = a.source_upload_id && a.source_timestamp_seconds != null
      ? `/dashboard/timeline/${a.source_upload_id}?t=${Math.floor(a.source_timestamp_seconds)}`
      : ''
    rows.push([a.item, status, priority, '', sourceRef])
  }

  const roadmap = (doc.roadmap || []) as ProjectDocumentRoadmapItem[]
  for (const r of roadmap) {
    const status = r.status === 'done' ? 'Done' : r.status === 'in_progress' ? 'In Progress' : 'Backlog'
    const priority = r.priority === 'high' ? 'Urgent' : r.priority === 'medium' ? 'Medium' : 'Low'
    rows.push([r.item, status, priority, '', ''])
  }

  const csv = rows.map(row =>
    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${projectName.toLowerCase().replace(/\s+/g, '-')}-linear.csv"`,
    },
  })
}
