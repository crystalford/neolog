/**
 * Capture pre-rebuild screenshots of every current dashboard page.
 *
 * Visual A/B reference for the page-by-page palette migration in Phases 5–7.
 * Saves PNGs to docs/before/.
 *
 * Usage:
 *   1. Start the dev server in another terminal:  pnpm dev
 *   2. Sign in to localhost:3000 in your normal browser to establish a session
 *   3. Export the session cookie to an env var (see step-by-step below)
 *   4. Run:  pnpm node scripts/capture-before-screenshots.mjs
 *
 * How to grab your session cookie (Chrome / Edge / Brave):
 *   - DevTools → Application → Cookies → http://localhost:3000
 *   - Find the Supabase auth cookie. It's typically named like
 *     `sb-<project-ref>-auth-token` and its value is a long base64 string.
 *   - Copy the full Name=Value pair, e.g. `sb-abc123-auth-token=eyJhb...`
 *   - export NEOLOG_SESSION_COOKIE='sb-abc123-auth-token=eyJhb...'
 *
 * If multiple cookies are needed (Supabase sometimes splits the auth cookie
 * across two, suffixed -0 and -1), join them with '; ':
 *   export NEOLOG_SESSION_COOKIE='sb-abc-auth-token-0=...; sb-abc-auth-token-1=...'
 *
 * Requires: pnpm add -D playwright (one-time)
 */

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = process.env.NEOLOG_BASE_URL || 'http://localhost:3000'
const SESSION_COOKIE = process.env.NEOLOG_SESSION_COOKIE
const OUT_DIR = path.resolve(process.cwd(), 'docs/before')

if (!SESSION_COOKIE) {
  console.error('Missing NEOLOG_SESSION_COOKIE env var — see header of this file for how to grab it.')
  process.exit(1)
}

const ROUTES = [
  { path: '/dashboard', file: 'home.png' },
  { path: '/dashboard/timeline', file: 'timeline.png' },
  { path: '/dashboard/videos', file: 'videos.png' },
  { path: '/dashboard/posts', file: 'posts.png' },
  { path: '/dashboard/studio', file: 'studio.png' },
  { path: '/dashboard/edit', file: 'edit.png' },
  { path: '/dashboard/brain', file: 'brain.png' },
  { path: '/dashboard/settings', file: 'settings.png' },
  { path: '/dashboard/system', file: 'system.png' },
  { path: '/dashboard/projects', file: 'projects.png' },
  { path: '/dashboard/character', file: 'character.png' },
  { path: '/dashboard/profile', file: 'profile.png' },
  { path: '/dashboard/synthesis', file: 'synthesis.png' },
  { path: '/dashboard/inventory', file: 'inventory.png' },
  { path: '/dashboard/portfolio', file: 'portfolio.png' },
  { path: '/dashboard/sessions', file: 'sessions.png' },
  { path: '/dashboard/queue', file: 'queue.png' },
  { path: '/dashboard/log', file: 'log.png' },
  { path: '/dashboard/ingest', file: 'ingest.png' },
  { path: '/dashboard/uploads', file: 'uploads.png' },
]

function parseCookies(cookieString) {
  return cookieString.split(/;\s*/).filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    const url = new URL(BASE_URL)
    return {
      name,
      value,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    }
  })
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })

  await context.addCookies(parseCookies(SESSION_COOKIE))
  const page = await context.newPage()

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`
    const out = path.join(OUT_DIR, route.file)
    try {
      console.log(`→ ${url}`)
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      // settle any client-side renders
      await page.waitForTimeout(1000)
      await page.screenshot({ path: out, fullPage: true })
      console.log(`  saved ${out}`)
    } catch (err) {
      console.warn(`  ⚠ ${route.path} failed: ${err.message}`)
    }
  }

  await browser.close()
  console.log(`\nDone. ${ROUTES.length} routes attempted, screenshots in ${OUT_DIR}.`)
  console.log(`Next: git add docs/before/ && git commit -m "Add pre-rebuild screenshots"`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
