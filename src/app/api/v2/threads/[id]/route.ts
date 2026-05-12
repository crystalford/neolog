export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const row = await findOne<{
    id: string
    topic: string
    take: string | null
    key_quotes: string | null
    questions_raised: string | null
    register: string | null
    strength: number | null
    transcript_span_start: number | null
    transcript_span_end: number | null
    abstracted_topic: string | null
    cluster_id: string | null
    extracted_at: string
    extraction_prompt_version: string
    vlog_id: string
    vlog_filename: string | null
    vlog_recorded_at: string | null
    vlog_thumbnail: string | null
  }>(
    db,
    `SELECT t.*, v.original_filename AS vlog_filename, v.recorded_at AS vlog_recorded_at, v.thumbnail_url AS vlog_thumbnail
       FROM threads t
       JOIN vlogs v ON v.id = t.vlog_id
      WHERE t.id = ? AND t.operator_id = ? AND t.deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parseArr = (raw: string | null): string[] => {
    if (!raw) return []
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.map(String) : [] }
    catch { return [] }
  }

  return NextResponse.json({
    thread: {
      id: row.id,
      topic: row.topic,
      abstracted_topic: row.abstracted_topic,
      take: row.take || '',
      key_quotes: parseArr(row.key_quotes),
      questions_raised: parseArr(row.questions_raised),
      register: row.register,
      strength: row.strength,
      transcript_span_start: row.transcript_span_start,
      transcript_span_end: row.transcript_span_end,
      cluster_id: row.cluster_id,
      extracted_at: row.extracted_at,
      extraction_prompt_version: row.extraction_prompt_version,
      vlog: {
        id: row.vlog_id,
        original_filename: row.vlog_filename,
        recorded_at: row.vlog_recorded_at,
        thumbnail_url: row.vlog_thumbnail,
      },
    },
  })
}
