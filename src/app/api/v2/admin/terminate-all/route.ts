/**
 * POST /api/v2/admin/terminate-all
 *
 * Hard-stops all running pipeline work for the operator. Two things to kill:
 *
 *   1. Cloudflare Workflow instances (the legacy `process-upload` workflow
 *      that the previous bulk run created). Each instance is identified by
 *      a Cloudflare-assigned ID and can be terminated via the
 *      api.cloudflare.com/client/v4 Workflows API.
 *
 *   2. Pipeline Durable Object instances (the newer DO-driven path). Each
 *      DO is named after a vlog_id. We can't enumerate DOs from outside,
 *      so we use the D1 vlogs table as the source of truth: any vlog with
 *      pipeline_status in (transcoding/transcribing/extracting/uploaded) is
 *      assumed to have a live DO; we POST /kill to the pipeline worker
 *      which forwards to the named DO.
 *
 * After this call, the only sound from the pipeline should be the
 * terminate-event row written to pipeline_events. Re-dispatching via the
 * bulk modal will then route through the new gated path.
 *
 * Body:
 *   { workflows?: boolean, dos?: boolean, dry_run?: boolean }
 *     Default: both true, dry_run false.
 *
 * Response:
 *   {
 *     workflows: { found, terminated, errors: [...] }
 *     dos:       { found, terminated, errors: [...] }
 *   }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const WORKFLOW_NAME = 'process-upload'
const IN_FLIGHT_STATUSES = ['transcoding', 'transcribing', 'extracting', 'uploaded']
const PAGE_SIZE = 100  // Cloudflare API pagination
const MAX_PAGES = 20   // hard cap so we never spin forever

function noStore(body: unknown, status = 200): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return noStore({ error: 'Unauthenticated' }, 401)
    throw e
  }

  const body = await req.json().catch(() => ({})) as {
    workflows?: boolean
    dos?: boolean
    dry_run?: boolean
  }
  const killWorkflows = body.workflows !== false
  const killDOs = body.dos !== false
  const dryRun = body.dry_run === true

  const result: {
    workflows: { found: number; terminated: number; errors: string[] }
    dos: { found: number; terminated: number; errors: string[] }
    dry_run: boolean
  } = {
    workflows: { found: 0, terminated: 0, errors: [] },
    dos: { found: 0, terminated: 0, errors: [] },
    dry_run: dryRun,
  }

  // ── Workflows: Cloudflare REST API ───────────────────────────────────────
  if (killWorkflows) {
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      result.workflows.errors.push(
        'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not bound on Pages env',
      )
    } else {
      try {
        // List instances. Filter to in-progress. The Workflows API returns
        // status field with values like 'queued', 'running', 'paused',
        // 'complete', 'errored', 'terminated', 'errored_unrecoverable'.
        // We terminate anything not in a terminal state.
        const candidates: string[] = []
        for (let page = 1; page <= MAX_PAGES; page++) {
          const url =
            `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}` +
            `/workflows/${WORKFLOW_NAME}/instances?per_page=${PAGE_SIZE}&page=${page}`
          const listRes = await fetch(url, {
            headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
          })
          if (!listRes.ok) {
            const err = await listRes.text()
            result.workflows.errors.push(`list page ${page}: ${listRes.status}: ${err.slice(0, 200)}`)
            break
          }
          const listJson: any = await listRes.json()
          const instances: any[] = listJson?.result ?? []
          for (const inst of instances) {
            const status = String(inst.status ?? '').toLowerCase()
            const terminal = ['complete', 'errored', 'terminated', 'errored_unrecoverable']
            if (!terminal.includes(status)) {
              candidates.push(String(inst.id))
            }
          }
          // Pagination — break if last page or short page.
          if (instances.length < PAGE_SIZE) break
        }
        result.workflows.found = candidates.length

        if (!dryRun) {
          // Terminate each in series with a small concurrency. Cloudflare
          // API rate-limits aggressive callers; 5 concurrent is a safe rate.
          const CONCURRENCY = 5
          let cursor = 0
          const worker = async () => {
            while (cursor < candidates.length) {
              const idx = cursor++
              const instId = candidates[idx]
              const termUrl =
                `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}` +
                `/workflows/${WORKFLOW_NAME}/instances/${instId}/status`
              try {
                const termRes = await fetch(termUrl, {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ status: 'terminate' }),
                })
                if (termRes.ok) {
                  result.workflows.terminated += 1
                } else {
                  const err = await termRes.text()
                  result.workflows.errors.push(`${instId}: ${termRes.status}: ${err.slice(0, 120)}`)
                }
              } catch (err: any) {
                result.workflows.errors.push(`${instId}: ${err?.message || err}`)
              }
            }
          }
          await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
        }
      } catch (err: any) {
        result.workflows.errors.push(`workflows terminate threw: ${err?.message || err}`)
      }
    }
  }

  // ── DOs: enumerate via D1, POST /kill via pipeline worker ───────────────
  if (killDOs) {
    if (!env.PIPELINE || !env.HEARTBEAT_TOKEN) {
      result.dos.errors.push('PIPELINE or HEARTBEAT_TOKEN binding missing — cannot kill DOs')
    } else {
      try {
        const db = getDb(env)
        const stuck = await findMany<{ id: string }>(
          db,
          `SELECT id FROM vlogs
            WHERE operator_id = ? AND deleted_at IS NULL
              AND pipeline_status IN ('${IN_FLIGHT_STATUSES.join("','")}')
            ORDER BY updated_at ASC
            LIMIT 500`,
          operator.id,
        )
        result.dos.found = stuck.length

        if (!dryRun) {
          const CONCURRENCY = 5
          let cursor = 0
          const worker = async () => {
            while (cursor < stuck.length) {
              const idx = cursor++
              const vlog_id = stuck[idx].id
              try {
                const killRes = await env.PIPELINE!.fetch(`https://internal/kill/${vlog_id}`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Heartbeat-Token': env.HEARTBEAT_TOKEN!,
                  },
                  body: JSON.stringify({ operator_id: operator.id }),
                })
                if (killRes.ok) {
                  result.dos.terminated += 1
                } else {
                  const err = await killRes.text()
                  result.dos.errors.push(`${vlog_id}: ${killRes.status}: ${err.slice(0, 120)}`)
                }
              } catch (err: any) {
                result.dos.errors.push(`${vlog_id}: ${err?.message || err}`)
              }
            }
          }
          await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
        }
      } catch (err: any) {
        result.dos.errors.push(`dos kill threw: ${err?.message || err}`)
      }
    }
  }

  return noStore(result)
}
