/**
 * Cron worker — fires the Pages app's refresh-drafts endpoint every 10
 * minutes so auto_publish_pending vlogs get swept without any user
 * presence.
 *
 * The refresh-drafts endpoint normally requires Cloudflare Access JWT
 * auth (operator-only). To let this cron call it, the Pages endpoint
 * accepts an X-Cron-Secret header + ?operator_id=... query param as an
 * auth bypass — same shared secret on both sides via `wrangler secret put`.
 *
 * Single-operator app, so we just hit the endpoint once per tick with
 * the configured operator_id. To support multi-operator later, the
 * cron would loop over a list pulled from D1 (not needed today).
 */

export interface Env {
  PAGES_BASE_URL: string
  CRON_SECRET: string         // shared with the Pages app
  OPERATOR_ID: string         // the single operator's id
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(fireSweep(env))
  },

  // Lets `wrangler dev` and curl invoke the same code path for testing.
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname !== '/run') {
      return new Response('cron worker — POST /run to fire manually', { status: 404 })
    }
    const result = await fireSweep(env)
    return new Response(JSON.stringify(result, null, 2), {
      status: result.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    })
  },
}

async function fireSweep(env: Env): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const url = `${env.PAGES_BASE_URL.replace(/\/$/, '')}/api/v2/refresh-drafts?operator_id=${encodeURIComponent(env.OPERATOR_ID)}`
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Cron-Secret': env.CRON_SECRET,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    const body = (await resp.text().catch(() => '')).slice(0, 2000)
    if (!resp.ok) {
      console.error(`[auto-publish-cron] refresh-drafts ${resp.status}: ${body}`)
    }
    return { ok: resp.ok, status: resp.status, body }
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error(`[auto-publish-cron] fetch threw: ${msg}`)
    return { ok: false, error: msg }
  }
}
