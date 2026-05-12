/**
 * GET /api/v2/clusters
 *
 * Returns the operator's active clusters with derived stats: thread count,
 * source vlog count, recent activity. Powers the Studio surface.
 *
 * Surfaces states as the three Studio buckets:
 *   ripening = state IN ('forming','surfaced','ripening')
 *   ready    = state = 'ready'
 *   hold     = state = 'hold_for_more'
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const db = getDb(env)
  const rows = await findMany<{
    id: string
    topic: string
    take: string | null
    abstracted_topic: string | null
    state: string
    ripeness_score: number | null
    form: string | null
    length_magnitude: string | null
    gap_question: string | null
    topic_color: string | null
    last_viewed_at: string | null
    state_changed_at: string
    thread_count: number
    vlog_count: number
  }>(
    db,
    `SELECT c.id, c.topic, c.take, c.abstracted_topic, c.state, c.ripeness_score,
            c.form, c.length_magnitude, c.gap_question, c.topic_color,
            c.last_viewed_at, c.state_changed_at,
            (SELECT COUNT(*) FROM cluster_threads WHERE cluster_id = c.id) AS thread_count,
            (SELECT COUNT(DISTINCT t.vlog_id)
               FROM cluster_threads ct
               JOIN threads t ON t.id = ct.thread_id
              WHERE ct.cluster_id = c.id) AS vlog_count
       FROM clusters c
      WHERE c.operator_id = ? AND c.deleted_at IS NULL
        AND c.state NOT IN ('archived', 'produced')
      ORDER BY c.ripeness_score DESC, c.updated_at DESC
      LIMIT 50`,
    operator.id,
  )

  const clusters = rows.map(r => ({
    id: r.id,
    topic_color: r.topic_color || 'bone-3',
    name: r.abstracted_topic || r.topic,
    form: r.form && r.length_magnitude
      ? `${formLabel(r.form)} · ${capitalize(r.length_magnitude)}`
      : (r.form ? formLabel(r.form) : 'Concept'),
    state: mapState(r.state),
    headline: r.take ? truncateHeadline(r.take) : r.topic,
    take: r.take || '',
    ripeness: r.ripeness_score ?? 0,
    gap_question: r.gap_question || undefined,
    outputs: [
      { name: 'Video essay', live: r.ripeness_score != null && r.ripeness_score >= 60 },
      { name: 'Article',     live: r.ripeness_score != null && r.ripeness_score >= 60 },
      { name: 'X thread',    live: r.ripeness_score != null && r.ripeness_score >= 50 },
      { name: 'Clips',       live: r.ripeness_score != null && r.ripeness_score >= 80 },
    ],
    stats: {
      threads: r.thread_count,
      sessions: r.vlog_count,
      awaiting: r.state === 'hold_for_more',
    },
    primary_action: r.state === 'ready' ? 'Materialize' : r.state === 'hold_for_more' ? 'Resume' : 'Develop',
  }))

  return NextResponse.json({ clusters })
}

function mapState(s: string): 'ripening' | 'ready' | 'hold' {
  if (s === 'ready') return 'ready'
  if (s === 'hold_for_more') return 'hold'
  return 'ripening'
}
function formLabel(form: string): string {
  switch (form) {
    case 'concept_essay': return 'Concept'
    case 'manifesto_rant': return 'Manifesto'
    case 'reflection': return 'Reflection'
    case 'cultural_criticism': return 'Cultural crit'
    case 'probe': return 'Probe'
    case 'aphoristic_probe': return 'Aphorism'
    case 'forensic': return 'Forensic'
    default: return capitalize(form)
  }
}
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }
function truncateHeadline(take: string): string {
  // First sentence or first 60 chars
  const firstSentence = take.split(/[.!?]/)[0]
  if (firstSentence.length <= 60) return firstSentence
  return firstSentence.slice(0, 57) + '…'
}
