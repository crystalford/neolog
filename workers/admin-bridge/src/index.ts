/**
 * neolog-admin-bridge
 *
 * HTTPS proxy from a *.workers.dev host (allow-listed in the Claude Code
 * web sandbox by default) to the Neolog admin API on neolog.ai (NOT
 * allow-listed). Solves the egress-proxy bug filed at
 *   anthropics/claude-code#52982 / #34690 / #19087
 * where the user-app domain allowlist is ignored on cloud sessions.
 *
 * Routes (all require Authorization: Bearer <CLAUDE_BEARER>):
 *
 *   GET  /              -> health probe (no auth)
 *   GET  /runtime-state -> proxies /api/v2/admin/runtime-state (?status= &step= &vlog_id= &limit_events= forwarded)
 *   POST /transcode-one -> proxies /api/v2/admin/transcode-one (body forwarded as-is)
 *   GET  /playback-audit -> proxies /api/v2/admin/playback-audit (?limit= forwarded)
 *   POST /restore-transcoded-links -> proxies /api/v2/admin/restore-transcoded-links
 *
 *   ANY /proxy/* -> escape hatch: forwards method + body to neolog.ai with
 *                   the path after /proxy/ appended. Lets Claude reach any
 *                   new admin endpoint without redeploying the bridge.
 *
 * Every response includes CORS headers so it's callable from any origin
 * (the worker is single-tenant, gated by the bearer).
 */

interface Env {
  CLAUDE_BEARER: string             // shared secret: Claude → bridge
  CF_ACCESS_CLIENT_ID: string       // Cloudflare Access service token id
  CF_ACCESS_CLIENT_SECRET: string   // Cloudflare Access service token secret
  NEOLOG_BASE_URL?: string          // optional override, defaults to https://neolog.ai
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const ROUTE_MAP: Record<string, { method: string; path: string }> = {
  '/runtime-state':            { method: 'GET',  path: '/api/v2/admin/runtime-state' },
  '/playback-audit':           { method: 'GET',  path: '/api/v2/admin/playback-audit' },
  '/transcode-one':            { method: 'POST', path: '/api/v2/admin/transcode-one' },
  '/restore-transcoded-links': { method: 'POST', path: '/api/v2/admin/restore-transcoded-links' },
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    const url = new URL(req.url)

    // Unauthenticated health probe.
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        worker: 'neolog-admin-bridge',
        time: new Date().toISOString(),
        routes: [...Object.keys(ROUTE_MAP), '/proxy/{path}'],
      })
    }

    // Bearer check for everything else.
    const bearer = req.headers.get('Authorization') || ''
    if (!env.CLAUDE_BEARER || bearer !== `Bearer ${env.CLAUDE_BEARER}`) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const base = (env.NEOLOG_BASE_URL || 'https://neolog.ai').replace(/\/$/, '')

    // Generic escape hatch: /proxy/<the rest> → <base>/<the rest>
    if (url.pathname.startsWith('/proxy/')) {
      const tail = url.pathname.slice('/proxy'.length) + url.search
      return forward(req, base + tail, env)
    }

    const route = ROUTE_MAP[url.pathname]
    if (!route) {
      return json({ error: `Unknown route ${url.pathname}`, routes: Object.keys(ROUTE_MAP) }, 404)
    }
    if (req.method !== route.method) {
      return json({ error: `Method ${req.method} not allowed for ${url.pathname}`, expected: route.method }, 405)
    }

    return forward(req, base + route.path + url.search, env)
  },
}

async function forward(req: Request, targetUrl: string, env: Env): Promise<Response> {
  // Forward method, body, and a minimal set of safe headers.
  const headers: Record<string, string> = {
    'CF-Access-Client-Id':     env.CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
  }
  const ct = req.headers.get('Content-Type')
  if (ct) headers['Content-Type'] = ct

  let body: ArrayBuffer | null = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer()
  }

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, { method: req.method, headers, body })
  } catch (err: any) {
    return json({
      error: 'Upstream fetch threw',
      target: targetUrl,
      detail: err?.message || String(err),
    }, 502)
  }

  // Pass body + status through, but normalize CORS and avoid leaking
  // Cloudflare Access cookies back to Claude.
  const out = new Headers(CORS)
  const upstreamCT = upstream.headers.get('Content-Type')
  if (upstreamCT) out.set('Content-Type', upstreamCT)
  out.set('X-Bridge-Upstream-Status', String(upstream.status))
  out.set('X-Bridge-Upstream-Url',    targetUrl)

  return new Response(upstream.body, { status: upstream.status, headers: out })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
