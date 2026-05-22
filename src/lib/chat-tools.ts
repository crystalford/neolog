/**
 * Chat tools — the function-call surface the chatbot can invoke to do real
 * work in Neolog. Each tool is a JSON Schema description + a runtime handler.
 *
 * Both Kimi K2.6 and Claude can call any tool defined here. The chat endpoint
 * (src/app/api/v2/chat/route.ts) loops:
 *
 *   1. Send messages to model with `availableTools()` schemas.
 *   2. If the model returns tool_calls, execute each via `runTool()`.
 *   3. Append the tool result as role='tool', call the model again.
 *   4. Repeat until the model returns a plain text answer (or hits TOOL_LIMIT).
 *
 * Tool results are intentionally compact — the model is paying tokens for
 * every byte they take, so we trim transcript_text aggressively and never
 * return raw R2 keys.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { findOne, findMany, run } from './d1'
import { ulid } from './ulid'
import type { ChatToolDef } from './llm'

export const TOOL_LIMIT = 12  // Max tool-call iterations in one chat turn before we cut off

export interface ToolCtx {
  db: D1Database
  operatorId: string
}

// ─── Tool schemas (sent to the model) ────────────────────────────────────────

export function availableTools(): ChatToolDef[] {
  return [
    {
      name: 'search_vlogs',
      description:
        'Full-text search over the operator\'s vlog transcripts. Use when the operator references a vlog or asks "what have I been saying about X". Returns up to `limit` matching vlogs with id, filename, recorded date, and a short transcript snippet around the match.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms. Plain words; SQLite LIKE matching.' },
          limit: { type: 'integer', default: 5, minimum: 1, maximum: 20 },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_vlog',
      description:
        'Fetch a single vlog with full metadata + transcript (truncated to ~4000 chars). Use after search_vlogs to look at a specific vlog in depth.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The vlog id from search_vlogs.' } },
        required: ['id'],
      },
    },
    {
      name: 'list_recent_threads',
      description:
        'List the operator\'s most recently extracted threads (analytical takes from vlogs). Each thread has topic, take, register, strength, abstracted_topic, and parent vlog id. Use for "what have you been thinking about lately" or general orientation.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
          topic_filter: { type: 'string', description: 'Optional filter on abstracted_topic.' },
        },
      },
    },
    {
      name: 'get_thread',
      description: 'Fetch one thread by id with key quotes and parent vlog info.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'list_clusters',
      description:
        'List the operator\'s clusters (3+ threads grouped by abstracted_topic). Use to see what topics are forming or ripe for productions.',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['forming', 'ripening', 'ripe', 'materialized'] },
          limit: { type: 'integer', default: 10 },
        },
      },
    },
    {
      name: 'get_cluster',
      description: 'Fetch one cluster with its member threads.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'save_note',
      description:
        'Save a piece of text the operator wants to keep — an article draft, a note, a transcript snippet. Returns the attachment id. Useful when the chatbot helps the operator draft an article and they say "save this".',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string', description: 'The full text. Markdown is fine.' },
          kind: { type: 'string', enum: ['article', 'document'], default: 'document' },
        },
        required: ['title', 'body'],
      },
    },
    {
      name: 'draft_x_post',
      description:
        'Create a draft X post (single tweet, not a thread). Returns the post id. The operator reviews and publishes manually from the post page.',
      parameters: {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'The tweet text. Keep under 280 chars.' },
        },
        required: ['body'],
      },
    },
    {
      name: 'search_threads',
      description:
        'Search the operator\'s threads (extracted takes) by query terms. Searches across topic, take, key_quotes, and abstracted_topic. Use when the operator asks "what have I said about X" or "find threads on Y" — threads are higher-signal than raw vlog transcripts because they\'re the operator\'s distilled positions. Returns id, topic, take, strength, extracted_at, vlog_id.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms. Plain words; SQLite LIKE matching on topic + take + key_quotes.' },
          min_strength: { type: 'integer', description: 'Optional: filter to threads with strength ≥ N (1-5).', minimum: 1, maximum: 5 },
          limit: { type: 'integer', description: 'Max results. Default 10, max 30.', minimum: 1, maximum: 30 },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_productions',
      description:
        'Search the operator\'s production drafts (script_text from articles, x_threads, micro_essays, video_essay scripts). Use when the operator asks "find the article I drafted about X" or wants to reference their own published / drafting work.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms.' },
          type: { type: 'string', description: 'Optional: filter by production_type.', enum: ['x_post', 'x_thread', 'micro_essay', 'article', 'clip', 'video_essay'] },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_entities',
      description:
        'List the top entities (people, places, projects, tools, concepts) in the operator\'s corpus by mention count. Use to see what / who the operator keeps coming back to.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', description: 'Optional filter: person | place | project | tool | concept | theme' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },
    },
  ]
}

// ─── Tool runner ─────────────────────────────────────────────────────────────

export async function runTool(
  ctx: ToolCtx,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case 'search_vlogs':       return JSON.stringify(await searchVlogs(ctx, args as any))
      case 'get_vlog':           return JSON.stringify(await getVlog(ctx, args as any))
      case 'list_recent_threads': return JSON.stringify(await listRecentThreads(ctx, args as any))
      case 'get_thread':         return JSON.stringify(await getThread(ctx, args as any))
      case 'list_clusters':      return JSON.stringify(await listClusters(ctx, args as any))
      case 'get_cluster':        return JSON.stringify(await getCluster(ctx, args as any))
      case 'save_note':          return JSON.stringify(await saveNote(ctx, args as any))
      case 'draft_x_post':       return JSON.stringify(await draftXPost(ctx, args as any))
      case 'search_threads':     return JSON.stringify(await searchThreads(ctx, args as any))
      case 'search_productions': return JSON.stringify(await searchProductions(ctx, args as any))
      case 'list_entities':      return JSON.stringify(await listEntities(ctx, args as any))
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err: any) {
    return JSON.stringify({ error: err?.message || String(err) })
  }
}

// ─── Individual tool implementations ─────────────────────────────────────────

async function searchVlogs(ctx: ToolCtx, args: { query: string; limit?: number }) {
  const limit = Math.min(20, Math.max(1, args.limit ?? 5))
  const pattern = `%${(args.query || '').slice(0, 200)}%`
  const rows = await findMany<{
    id: string
    original_filename: string | null
    recorded_at: string | null
    snippet: string | null
  }>(
    ctx.db,
    `SELECT id, original_filename, recorded_at,
            substr(transcript_text,
                   max(1, instr(lower(transcript_text), lower(?)) - 80),
                   240) AS snippet
       FROM vlogs
      WHERE operator_id = ?
        AND deleted_at IS NULL
        AND transcript_text IS NOT NULL
        AND transcript_text LIKE ?
      ORDER BY recorded_at DESC NULLS LAST, created_at DESC
      LIMIT ?`,
    args.query, ctx.operatorId, pattern, limit,
  )
  return { count: rows.length, vlogs: rows }
}

async function getVlog(ctx: ToolCtx, args: { id: string }) {
  const vlog = await findOne<{
    id: string
    original_filename: string | null
    recorded_at: string | null
    duration_seconds: number | null
    transcript_text: string | null
    pipeline_status: string
  }>(
    ctx.db,
    `SELECT id, original_filename, recorded_at, duration_seconds, transcript_text, pipeline_status
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    args.id, ctx.operatorId,
  )
  if (!vlog) return { error: 'Not found' }
  // Truncate transcript so a 60-minute vlog doesn't blow the context window.
  if (vlog.transcript_text && vlog.transcript_text.length > 4000) {
    vlog.transcript_text = vlog.transcript_text.slice(0, 4000) + '\n…[truncated]'
  }
  return vlog
}

async function listRecentThreads(ctx: ToolCtx, args: { limit?: number; topic_filter?: string }) {
  const limit = Math.min(50, Math.max(1, args.limit ?? 10))
  const params: unknown[] = [ctx.operatorId]
  let where = `operator_id = ? AND deleted_at IS NULL`
  if (args.topic_filter) {
    where += ` AND lower(abstracted_topic) LIKE ?`
    params.push(`%${args.topic_filter.toLowerCase()}%`)
  }
  params.push(limit)
  const rows = await findMany<{
    id: string
    topic: string
    take: string | null
    abstracted_topic: string | null
    register: string | null
    strength: number | null
    vlog_id: string
    extracted_at: string
  }>(
    ctx.db,
    `SELECT id, topic, take, abstracted_topic, register, strength, vlog_id, extracted_at
       FROM threads WHERE ${where}
       ORDER BY extracted_at DESC LIMIT ?`,
    ...params,
  )
  return { count: rows.length, threads: rows }
}

async function getThread(ctx: ToolCtx, args: { id: string }) {
  const thread = await findOne<any>(
    ctx.db,
    `SELECT id, vlog_id, topic, take, key_quotes, register, strength, abstracted_topic, extracted_at
       FROM threads WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    args.id, ctx.operatorId,
  )
  if (!thread) return { error: 'Not found' }
  try { if (thread.key_quotes) thread.key_quotes = JSON.parse(thread.key_quotes) } catch {}
  return thread
}

async function listClusters(ctx: ToolCtx, args: { state?: string; limit?: number }) {
  const limit = Math.min(50, Math.max(1, args.limit ?? 10))
  const params: unknown[] = [ctx.operatorId]
  let where = `operator_id = ? AND deleted_at IS NULL`
  if (args.state) {
    where += ` AND state = ?`
    params.push(args.state)
  }
  params.push(limit)
  const rows = await findMany<{
    id: string
    title: string | null
    abstracted_topic: string | null
    state: string
    ripeness_score: number | null
    thread_count: number | null
  }>(
    ctx.db,
    `SELECT id, title, abstracted_topic, state, ripeness_score, thread_count
       FROM clusters WHERE ${where}
       ORDER BY updated_at DESC LIMIT ?`,
    ...params,
  )
  return { count: rows.length, clusters: rows }
}

async function getCluster(ctx: ToolCtx, args: { id: string }) {
  const cluster = await findOne<any>(
    ctx.db,
    `SELECT id, title, abstracted_topic, state, ripeness_score, summary
       FROM clusters WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    args.id, ctx.operatorId,
  )
  if (!cluster) return { error: 'Not found' }
  const threads = await findMany<any>(
    ctx.db,
    `SELECT t.id, t.topic, t.take, t.abstracted_topic
       FROM cluster_threads ct
       JOIN threads t ON t.id = ct.thread_id
      WHERE ct.cluster_id = ? AND t.deleted_at IS NULL
      ORDER BY t.extracted_at DESC LIMIT 20`,
    args.id,
  )
  return { cluster, threads }
}

async function saveNote(
  ctx: ToolCtx,
  args: { title: string; body: string; kind?: 'article' | 'document' },
) {
  const id = ulid()
  await run(
    ctx.db,
    `INSERT INTO attachments
       (id, operator_id, r2_key, original_filename, mime_type, kind, extracted_text, file_size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    ctx.operatorId,
    `${ctx.operatorId}/chat-notes/${id}.md`,
    `${args.title}.md`,
    'text/markdown',
    args.kind ?? 'document',
    args.body,
    args.body.length,
  )
  return { id, message: 'Saved.' }
}

async function draftXPost(ctx: ToolCtx, args: { body: string }) {
  const id = ulid()
  const body = (args.body || '').slice(0, 4000)
  await run(
    ctx.db,
    `INSERT INTO posts (id, operator_id, kind, source_kind, body, character_count, state)
     VALUES (?, ?, 'x_post', 'manual', ?, ?, 'pending')`,
    id, ctx.operatorId, body, body.length,
  )
  return { id, character_count: body.length, message: 'Drafted. Operator can review and publish.' }
}

// ─── search_threads ────────────────────────────────────────────────
// Search the operator's threads by topic + take + key_quotes (LIKE).
// Higher-signal than search_vlogs because threads are the operator's
// distilled positions, not raw transcript text.
async function searchThreads(
  ctx: ToolCtx,
  args: { query: string; min_strength?: number; limit?: number },
) {
  const limit = Math.min(30, Math.max(1, args.limit ?? 10))
  const pattern = `%${(args.query || '').slice(0, 200)}%`
  const minStrength = args.min_strength ?? 0
  const rows = await findMany<{
    id: string; topic: string; take: string | null
    abstracted_topic: string | null; strength: number | null
    extracted_at: string; vlog_id: string
  }>(
    ctx.db,
    `SELECT t.id, t.topic, t.take, t.abstracted_topic, t.strength,
            t.extracted_at, t.vlog_id
       FROM threads t
       JOIN extraction_runs er ON er.id = t.run_id AND er.is_active = 1
      WHERE t.operator_id = ? AND t.deleted_at IS NULL
        AND COALESCE(t.strength, 0) >= ?
        AND (
          LOWER(t.topic) LIKE LOWER(?)
          OR LOWER(COALESCE(t.abstracted_topic, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(t.take, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(t.key_quotes, '')) LIKE LOWER(?)
        )
      ORDER BY t.strength DESC, t.extracted_at DESC
      LIMIT ?`,
    ctx.operatorId, minStrength, pattern, pattern, pattern, pattern, limit,
  )
  return {
    threads: rows.map(r => ({
      id: r.id,
      topic: r.abstracted_topic ?? r.topic,
      take: r.take,
      strength: r.strength ?? null,
      extracted_at: r.extracted_at,
      vlog_id: r.vlog_id,
    })),
    count: rows.length,
  }
}

// ─── search_productions ────────────────────────────────────────────
// Search the operator's production drafts by script_text content.
// Excludes clips (no script). Used when the operator references their
// own drafting work.
async function searchProductions(
  ctx: ToolCtx,
  args: { query: string; type?: string; limit?: number },
) {
  const limit = Math.min(20, Math.max(1, args.limit ?? 8))
  const pattern = `%${(args.query || '').slice(0, 200)}%`
  const typeFilter = args.type ? ' AND production_type = ?' : ''
  const params: any[] = [ctx.operatorId, pattern]
  if (args.type) params.push(args.type)
  params.push(limit)
  const rows = await findMany<{
    id: string; production_type: string; state: string
    script_text: string | null; source_kind: string; source_id: string
    updated_at: string; visibility: string
  }>(
    ctx.db,
    `SELECT id, production_type, state, script_text, source_kind, source_id, updated_at, visibility
       FROM productions
      WHERE operator_id = ? AND deleted_at IS NULL
        AND script_text IS NOT NULL
        AND LOWER(script_text) LIKE LOWER(?)
        ${typeFilter}
      ORDER BY updated_at DESC
      LIMIT ?`,
    ...params,
  )
  return {
    productions: rows.map(r => ({
      id: r.id,
      production_type: r.production_type,
      state: r.state,
      visibility: r.visibility,
      excerpt: (r.script_text || '').replace(/\s+/g, ' ').slice(0, 240),
      updated_at: r.updated_at,
      source: { kind: r.source_kind, id: r.source_id },
    })),
    count: rows.length,
  }
}

// ─── list_entities ─────────────────────────────────────────────────
// Top entities by mention_count. Surfaces the people / places /
// concepts / tools the operator keeps returning to.
async function listEntities(
  ctx: ToolCtx,
  args: { entity_type?: string; limit?: number },
) {
  const limit = Math.min(50, Math.max(1, args.limit ?? 20))
  const typeFilter = args.entity_type ? ' AND entity_type = ?' : ''
  const params: any[] = [ctx.operatorId]
  if (args.entity_type) params.push(args.entity_type)
  params.push(limit)
  const rows = await findMany<{
    id: string; name: string; entity_type: string; mention_count: number | null
  }>(
    ctx.db,
    `SELECT id, name, entity_type, mention_count
       FROM entities
      WHERE operator_id = ? AND deleted_at IS NULL
        ${typeFilter}
      ORDER BY mention_count DESC, name ASC
      LIMIT ?`,
    ...params,
  )
  return {
    entities: rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.entity_type,
      mention_count: r.mention_count ?? 1,
    })),
    count: rows.length,
  }
}
