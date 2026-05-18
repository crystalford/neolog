/**
 * Neolog pipeline coordinator — hosts the VlogPipelineDO Durable Object.
 *
 * Routes:
 *   GET  /ws/:vlog_id          Hibernatable WebSocket — browser subscribes
 *                              for live progress; on connect, gets a snapshot
 *                              of the last 200 pipeline_events for this vlog.
 *
 *   POST /event/:vlog_id       Workflow / container / extractor reports a
 *                              step event. Authenticated via shared
 *                              HEARTBEAT_TOKEN header. Inserts to D1 and
 *                              fans out to connected WS clients.
 *
 *   GET  /events/:vlog_id      Read the last N events for a vlog (admin
 *                              fallback path; the Pages /api/v2/vlogs/[id]/events
 *                              route normally serves this from D1 directly).
 *
 * Authentication: writes (POST /event) require X-Heartbeat-Token header.
 * Reads (GET /ws, /events) are open — Cloudflare Access gates the Pages
 * /api/v2/vlogs/[id]/ws bridge that fronts /ws.
 */

import type { D1Database, DurableObjectNamespace, DurableObjectState } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  PIPELINE_DO: DurableObjectNamespace
  HEARTBEAT_TOKEN: string
}

export interface PipelineEvent {
  id?: number
  vlog_id: string
  operator_id: string
  step: string
  sub_step?: string | null
  status: 'starting' | 'running' | 'ok' | 'error' | 'retrying' | 'failed_terminal' | 'skipped'
  started_at?: number
  ts: number
  duration_ms?: number | null
  detail_json: string  // stringified JSON; UI parses
  error_full_text?: string | null
  attempt?: number
}

const MAX_SNAPSHOT_EVENTS = 200

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const segs = url.pathname.split('/').filter(Boolean) // [route, vlog_id]
    const route = segs[0]
    const vlog_id = segs[1]

    if (!vlog_id) return new Response('vlog_id required', { status: 400 })

    if (route === 'ws') {
      const id = env.PIPELINE_DO.idFromName(vlog_id)
      const stub = env.PIPELINE_DO.get(id)
      return stub.fetch(req)
    }

    if (route === 'event') {
      if (req.method !== 'POST') return new Response('POST only', { status: 405 })
      if (req.headers.get('x-heartbeat-token') !== env.HEARTBEAT_TOKEN) {
        return new Response('forbidden', { status: 403 })
      }
      const body = await req.json().catch(() => null) as Partial<PipelineEvent> | null
      if (!body || !body.step || !body.status || !body.operator_id) {
        return new Response('step, status, operator_id required', { status: 400 })
      }
      const event: PipelineEvent = {
        vlog_id,
        operator_id: body.operator_id,
        step: body.step,
        sub_step: body.sub_step ?? null,
        status: body.status,
        started_at: body.started_at ?? Date.now(),
        ts: body.ts ?? Date.now(),
        duration_ms: body.duration_ms ?? null,
        detail_json: typeof body.detail_json === 'string'
          ? body.detail_json
          : JSON.stringify(body.detail_json ?? {}),
        error_full_text: body.error_full_text ?? null,
        attempt: body.attempt ?? 1,
      }
      const rowId = await insertEvent(env.DB, event)
      // Fan out to connected WS clients via the DO
      const id = env.PIPELINE_DO.idFromName(vlog_id)
      const stub = env.PIPELINE_DO.get(id)
      await stub.fetch(`https://do/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...event, id: rowId }),
      })
      return new Response(JSON.stringify({ ok: true, id: rowId }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (route === 'events') {
      const rows = await readRecentEvents(env.DB, vlog_id, MAX_SNAPSHOT_EVENTS)
      return new Response(JSON.stringify({ events: rows }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('not found', { status: 404 })
  },
}

// Pipeline_events has CHECK(status IN ('started','ok','failed','skipped'))
// from the original migration. The DO emits richer statuses; we map them
// here for the column and preserve the original in detail_json.state so
// the UI can render them faithfully.
function mapStatusForColumn(s: PipelineEvent['status']): string {
  switch (s) {
    case 'ok': return 'ok'
    case 'skipped': return 'skipped'
    case 'error':
    case 'failed_terminal': return 'failed'
    case 'starting':
    case 'running':
    case 'retrying':
    default: return 'started'
  }
}

async function insertEvent(db: D1Database, e: PipelineEvent): Promise<number> {
  // Enrich detail_json with the original (rich) status so the UI sees it
  let detail: Record<string, unknown> = {}
  try { detail = JSON.parse(e.detail_json) as Record<string, unknown> } catch {}
  detail.state = e.status
  const detailStr = JSON.stringify(detail)

  // Use a UUID id since the original column is TEXT PRIMARY KEY, not INTEGER.
  const id = crypto.randomUUID()
  await db.prepare(
    `INSERT INTO pipeline_events
       (id, vlog_id, operator_id, step, sub_step, status, started_at,
        completed_at, duration_ms, detail_json, error_full_text, attempt, ts)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
  ).bind(
    id, e.vlog_id, e.operator_id, e.step, e.sub_step,
    mapStatusForColumn(e.status),
    `-${Math.round((e.duration_ms ?? 0) / 1000)} seconds`,
    e.duration_ms, detailStr, e.error_full_text,
    e.attempt ?? 1, e.ts,
  ).run()
  return 0  // table uses TEXT id; numeric return unused by callers
}

async function readRecentEvents(db: D1Database, vlog_id: string, limit: number): Promise<PipelineEvent[]> {
  // ts may be NULL on older rows written before the column existed; fall
  // back to started_at (ISO string) → epoch ms.
  const res = await db.prepare(
    `SELECT id, vlog_id, operator_id, step, sub_step, status,
            COALESCE(ts, CAST(strftime('%s', started_at) AS INTEGER) * 1000) AS ts,
            duration_ms, detail_json, error_full_text,
            COALESCE(attempt, 1) AS attempt
       FROM pipeline_events
      WHERE vlog_id = ?
      ORDER BY ts ASC
      LIMIT ?`,
  ).bind(vlog_id, limit).all<PipelineEvent>()
  return res.results ?? []
}

/**
 * VlogPipelineDO — one instance per vlog.
 *
 * Holds an in-memory set of Hibernatable WebSockets for browsers watching
 * this vlog. Broadcasts events arriving via the host worker's POST /event.
 * Hibernates between events; WS clients stay connected through eviction.
 */
export class VlogPipelineDO {
  private state: DurableObjectState
  private env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const segs = url.pathname.split('/').filter(Boolean)

    // GET /ws/:vlog_id — browser connect
    if (segs[0] === 'ws') {
      if (req.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 })
      }
      const vlog_id = segs[1]
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
      // acceptWebSocket (not ws.accept) is what keeps us hibernatable.
      this.state.acceptWebSocket(server)

      // Send snapshot of recent events immediately so the UI catches up.
      const snapshot = await readRecentEvents(this.env.DB, vlog_id, MAX_SNAPSHOT_EVENTS)
      try {
        server.send(JSON.stringify({ type: 'snapshot', vlog_id, events: snapshot }))
      } catch {}

      return new Response(null, { status: 101, webSocket: client })
    }

    // POST /broadcast — host worker forwards a freshly-inserted event here
    if (segs[0] === 'broadcast' && req.method === 'POST') {
      const event = await req.json() as PipelineEvent
      const sockets = this.state.getWebSockets()
      const payload = JSON.stringify({ type: 'event', event })
      for (const ws of sockets) {
        try { ws.send(payload) } catch {}
      }
      return new Response('ok')
    }

    return new Response('not found', { status: 404 })
  }

  // Hibernatable WebSocket lifecycle hooks
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Browser doesn't send anything meaningful — ignore.
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    // Hibernatable WS cleans up automatically.
  }

  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> {
    // Same.
  }
}
