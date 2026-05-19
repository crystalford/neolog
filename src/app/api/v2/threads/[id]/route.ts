export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
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

  // Best-effort: cluster + related threads + transcript excerpt. Each query
  // wrapped so missing tables / column drift can't 500 the page.
  const safe = async <T,>(label: string, q: () => Promise<T>): Promise<T | null> => {
    try { return await q() } catch (err: any) {
      console.warn(`[threads/[id]] ${label} failed: ${err?.message || err}`)
      return null
    }
  }

  const [cluster, connections, related, excerpt] = await Promise.all([
    row.cluster_id ? safe('cluster', () => findOne<{ id: string; name: string | null; abstracted_topic: string | null }>(
      db,
      `SELECT id, name, abstracted_topic FROM clusters WHERE id = ? AND operator_id = ?`,
      row.cluster_id!, operator.id,
    )) : Promise.resolve(null),
    safe('connections', () => findMany<{
      thread_a_id: string; thread_b_id: string;
      connection_type: string; confidence: number | null;
    }>(
      db,
      `SELECT thread_a_id, thread_b_id, connection_type, confidence
         FROM thread_connections
        WHERE (thread_a_id = ? OR thread_b_id = ?)
        LIMIT 20`,
      params.id, params.id,
    )),
    // Other recent threads on the same abstracted_topic (excluding this one
    // and the same vlog). Cheap "what else have I said about this" surface.
    row.abstracted_topic ? safe('related', () => findMany<{
      id: string; topic: string; take: string | null; vlog_id: string;
      extracted_at: string;
    }>(
      db,
      `SELECT id, topic, take, vlog_id, extracted_at
         FROM threads
        WHERE operator_id = ? AND LOWER(abstracted_topic) = LOWER(?)
          AND id != ? AND vlog_id != ? AND deleted_at IS NULL
        ORDER BY extracted_at DESC
        LIMIT 6`,
      operator.id, row.abstracted_topic, params.id, row.vlog_id,
    )) : Promise.resolve([]),
    // Transcript words covering the take's transcript span.
    (row.transcript_span_start != null && row.transcript_span_end != null)
      ? safe('excerpt', () => findMany<{ word: string; start_time: number }>(
          db,
          `SELECT word, start_time FROM transcript_words
            WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
            ORDER BY word_index ASC
            LIMIT 600`,
          row.vlog_id, row.transcript_span_start!, row.transcript_span_end!,
        ))
      : Promise.resolve([]),
  ])

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
    cluster,
    connections: connections ?? [],
    related: related ?? [],
    transcript_excerpt: (excerpt ?? []).map(w => w.word).join(' '),
  })
}
