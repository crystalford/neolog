/**
 * Topic research — let the system go gather material from the open web
 * so video essays no longer depend on the operator uploading vlogs.
 *
 * Two source modes, picked per call:
 *   1. PASTED — operator pasted N URLs into topic.pasted_urls_json.
 *      We crawl those, no search.
 *   2. AUTO — Brave Search API finds candidate URLs from the topic +
 *      angle; we crawl the top K.
 *   3. BOTH — pasted URLs always win; auto-search only fills the
 *      remaining slots if any (mode='both').
 *
 * The fetched markdown is stored in R2 per source so the operator can
 * audit what was used. gpt-oss-120b then synthesizes a research brief
 * (key facts, claims, framings) which becomes topic.research_brief and
 * feeds the script generator as SUBSTANCE — voice still comes from the
 * operator's past vlogs.
 */

import { callReasoning } from './models'
import { putObject, type R2Env } from './r2'
import { ulid } from './ulid'
import type { D1Database } from '@cloudflare/workers-types'

const MAX_TOTAL_SOURCES = 8
const BROWSER_RUN_CRAWL_URL = 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/browser-rendering/crawl'

export interface ResearchEnv extends R2Env {
  DB: D1Database
  AI: { run: (model: any, args: unknown) => Promise<any> }
  CLOUDFLARE_API_TOKEN?: string
}

export interface ResearchedSource {
  url: string
  title: string | null
  summary: string | null
  origin: 'pasted' | 'auto'
  content_r2_key: string | null
  bytes: number
  error?: string
}

export interface ResearchResult {
  brief: string
  sources: ResearchedSource[]
  status: 'ok' | 'partial' | 'failed'
  errors: string[]
}

interface ResearchInput {
  topicId: string
  operatorId: string
  title: string
  angle: string | null
  notes: string | null
  pastedUrls: string[]
  braveKey: string | null
  mode: 'pasted_only' | 'auto_only' | 'both'
  /** Pre-formatted operator profile block (from formatOperatorProfile). */
  profileBlock?: string
}

/**
 * Run the research pass for a topic. Writes per-source rows to D1, writes
 * fetched markdown to R2, returns a synthesized brief.
 */
export async function researchTopic(env: ResearchEnv, input: ResearchInput): Promise<ResearchResult> {
  const errors: string[] = []
  const sources: ResearchedSource[] = []

  // ── 1. Source URLs ─────────────────────────────────────────────────────
  const pasted = uniqueUrls(input.pastedUrls).slice(0, MAX_TOTAL_SOURCES)
  let candidates: { url: string; origin: 'pasted' | 'auto' }[] = pasted.map(url => ({ url, origin: 'pasted' as const }))

  if (input.mode !== 'pasted_only') {
    const remaining = MAX_TOTAL_SOURCES - candidates.length
    if (remaining > 0 && input.braveKey) {
      try {
        const found = await braveSearch(input.braveKey, input.title, input.angle, remaining)
        for (const url of found) {
          if (!candidates.find(c => c.url === url)) {
            candidates.push({ url, origin: 'auto' })
          }
        }
      } catch (err: any) {
        errors.push(`brave search failed: ${err?.message || err}`.slice(0, 240))
      }
    } else if (remaining > 0 && !input.braveKey && input.mode === 'auto_only') {
      errors.push('auto-search requested but Brave Search API key not set in Settings.')
    }
  }
  if (candidates.length === 0) {
    return {
      brief: '',
      sources: [],
      status: 'failed',
      errors: errors.length > 0 ? errors : ['no source URLs (paste some or set a Brave key in Settings)'],
    }
  }

  // ── 2. Crawl each source via Browser Run ───────────────────────────────
  for (const c of candidates) {
    try {
      const out = await crawlOne(env, c.url)
      const sourceId = ulid()
      const r2Key = `${input.operatorId}/research/${input.topicId}/${sourceId}.md`
      await putObject(env, r2Key, new TextEncoder().encode(out.markdown), {
        httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      })
      await env.DB.prepare(
        `INSERT INTO topic_sources
           (id, topic_id, operator_id, url, title, summary, origin, content_r2_key, bytes, fetched_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, CURRENT_TIMESTAMP)`,
      ).bind(sourceId, input.topicId, input.operatorId, c.url, out.title ?? null,
             c.origin, r2Key, out.markdown.length).run()
      sources.push({
        url: c.url, title: out.title ?? null, summary: null,
        origin: c.origin, content_r2_key: r2Key, bytes: out.markdown.length,
      })
    } catch (err: any) {
      const msg = `${c.url}: ${err?.message || err}`.slice(0, 300)
      errors.push(msg)
      sources.push({
        url: c.url, title: null, summary: null, origin: c.origin,
        content_r2_key: null, bytes: 0, error: msg,
      })
    }
  }

  const successful = sources.filter(s => !s.error && s.content_r2_key)
  if (successful.length === 0) {
    return { brief: '', sources, status: 'failed', errors }
  }

  // ── 3. Synthesize a research brief from the fetched markdown ───────────
  const briefInput = await Promise.all(successful.map(async (s, i) => {
    const obj = await env.VIDEOS.get(s.content_r2_key!)
    const md = obj ? await obj.text() : ''
    return `[${i + 1}] ${s.title ?? s.url}\nURL: ${s.url}\n${md.slice(0, 12000)}`
  }))
  const userPrompt = `TOPIC: ${input.title}\n${input.angle ? `OPERATOR'S ANGLE: ${input.angle}\n` : ''}${input.notes ? `OPERATOR'S NOTES: ${input.notes}\n` : ''}\nSOURCES:\n\n${briefInput.join('\n\n────────────────────────\n\n')}${input.profileBlock ?? ''}\n\nNow write the research brief. ${input.profileBlock ? "Where the source material naturally connects to something the operator already cares about (per the profile above), surface that in the framings/tensions section." : ''}`

  let brief = ''
  try {
    const r = await callReasoning(env as any, {
      system: BRIEF_SYSTEM,
      user: userPrompt,
      effort: 'high',
      maxTokens: 4096,
    })
    brief = r.text
  } catch (err: any) {
    errors.push(`brief synthesis failed: ${err?.message || err}`.slice(0, 240))
    return { brief: '', sources, status: 'failed', errors }
  }

  return {
    brief,
    sources,
    status: errors.length === 0 ? 'ok' : 'partial',
    errors,
  }
}

// ─── Brave Search ────────────────────────────────────────────────────────

async function braveSearch(apiKey: string, title: string, angle: string | null, count: number): Promise<string[]> {
  const query = angle ? `${title} — ${angle}` : title
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(count * 2, 20)}`
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
  })
  if (!r.ok) throw new Error(`Brave Search ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data: any = await r.json()
  const results = data?.web?.results ?? []
  const urls: string[] = []
  for (const result of results) {
    if (typeof result?.url === 'string' && !isJunkUrl(result.url)) {
      urls.push(result.url)
      if (urls.length >= count) break
    }
  }
  return urls
}

function isJunkUrl(url: string): boolean {
  // Skip aggregators / login-walled / pure-video that browser-run can't crawl.
  return /(?:facebook\.com|instagram\.com|tiktok\.com|x\.com\/[^/]+\/status|reddit\.com\/r\/.*\/comments|youtube\.com\/watch|youtu\.be)/i.test(url)
}

// ─── Cloudflare Browser Run /crawl ──────────────────────────────────────

interface CrawlResult { title: string | null; markdown: string }

async function crawlOne(env: ResearchEnv, url: string): Promise<CrawlResult> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const token = env.CLOUDFLARE_API_TOKEN
  if (!accountId || !token) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN must be set as Worker secrets for Browser Run.')
  }
  const endpoint = BROWSER_RUN_CRAWL_URL.replace('{ACCOUNT_ID}', accountId)
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, response_format: 'markdown' }),
  })
  if (!r.ok) {
    throw new Error(`Browser Run /crawl ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  const data: any = await r.json()
  const md: string =
    (typeof data?.result?.markdown === 'string' && data.result.markdown) ||
    (typeof data?.markdown === 'string' && data.markdown) ||
    (typeof data?.result?.content === 'string' && data.result.content) ||
    ''
  if (!md || md.length < 200) {
    throw new Error('Browser Run returned empty/tiny markdown')
  }
  const title: string | null =
    (typeof data?.result?.title === 'string' && data.result.title) ||
    (typeof data?.title === 'string' && data.title) || null
  return { title, markdown: md }
}

// ─── Brief synthesis prompt ──────────────────────────────────────────────

const BRIEF_SYSTEM = `You are a research editor preparing a TIGHT brief for a video essayist. They've handed you a topic, an optional angle, and a set of web sources. Synthesize the substance.

Your output goes straight into the script writer's source context. It is NOT the script — it's the FACT BASE and ARGUMENT BASE the writer will build from.

OUTPUT FORMAT (Markdown):

  ## TL;DR
  2-4 sentences summarizing what this topic actually is and why it matters. Plain English. No "in this brief…" filler.

  ## Key facts
  Bullet list of CONCRETE, SOURCED facts. Each bullet ≤ 30 words. Cite source numbers: "(1)", "(3)". Only facts the sources actually support — never fabricate.

  ## Framings and tensions
  Bullet list of the COMPETING TAKES that exist on this topic — 2-5 of them. Each one ≤ 40 words. Cite sources where relevant.

  ## Quotes worth using
  2-5 short, sharp verbatim quotes from the sources (NOT the operator). Each ≤ 30 words. Each tagged with source number.

  ## Gaps / what's missing
  1-3 things the sources DON'T tell us that would matter. Be honest. These help the writer say "[verify: X]" instead of fabricating.

RULES:
- Stay close to what the sources say. Hedge or skip rather than invent.
- If sources contradict, surface the contradiction. Don't pick a side.
- Don't moralize. Don't add "however, it's also true that…" unless a source actually says so.
- This brief should be readable in under 90 seconds and useful for writing an essay.

Return ONLY the Markdown brief. No preamble.`

// ─── Angle suggestions ──────────────────────────────────────────────────
// Given a topic title, propose 4-6 specific angles a video essay could take.
// Each angle is short + concrete + actionable. When a Brave key is present
// we peek at the top search results so the suggestions reflect what's
// actually out there about the topic; without a key they're concept-only.

export interface SuggestedAngle {
  angle: string
  framing: string
  research_questions: string[]
}

const ANGLES_SYSTEM = `You are a sharp documentary / video-essay editor pitching DIRECTIONS for a piece on a topic the operator just named.

Your job: propose 4–6 SPECIFIC, ACTIONABLE angles. Each one is a DIFFERENT video essay you could make about the same topic. The operator will pick one (or write their own).

WHAT MAKES A GOOD ANGLE:
- A NAMED LENS, not a vague theme. Not "Identity" — "The persona drifts: what happens when a character you play for 8 hours a day starts running the rest of your decisions."
- A SPECIFIC TENSION, contradiction, or question — something the piece could actually argue or investigate.
- Different ANGLES on the same topic should feel like DIFFERENT essays, not variations of the same thing.

EACH ANGLE has three parts:
  · angle: a 4-10 word DIRECTIONAL handle. ("The parasocial collapse." "Attention economy as a job.")
  · framing: one sentence in second person telling the operator what this piece would actually argue, attack, or explore. ("You'd examine the moment the relationship between streamer and viewer crosses from product to obligation, using X as the case study.")
  · research_questions: 2-4 specific questions the operator would need answered to write this piece. The operator can use these to direct research.

RULES:
- If the topic is a PERSON, lean on what they DO that's interesting, not biographical recap. ("LeBron's longevity" → angles about training science, business decisions, racial scripting of "the chosen one," the politics of acknowledgment, etc.)
- If the topic is an IDEA, push toward where the idea is contested, applied, or has consequences.
- If WEB SEARCH RESULTS are provided, use them to ground angles in what actually exists — don't propose angles that have no purchase on reality.
- NEVER propose angles that require the operator to be the topic's expert. They are a generalist video essayist.
- DON'T moralize. ("Why X matters" / "The dark side of Y" are bad angles.)

Return ONLY this JSON. No prose. No markdown fences.
{"angles":[{"angle":"...","framing":"...","research_questions":["...","..."]}]}`

export async function suggestTopicAngles(
  env: ResearchEnv,
  args: {
    title: string
    angle?: string | null
    braveKey?: string | null
    /**
     * Pre-formatted operator profile block. Pass via
     * formatOperatorProfile(await loadOperatorProfile(...)). When present,
     * the suggester knows what the operator already circles and proposes
     * angles connected to (or deliberately apart from) those.
     */
    profileBlock?: string
  },
): Promise<{ suggestions: SuggestedAngle[]; grounded: boolean; error?: string }> {
  // Peek at the web if we can — five lightweight results from Brave (title +
  // description, no crawling) so the model knows what's actually out there.
  let webContext = ''
  let grounded = false
  if (args.braveKey) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.title)}&count=8`
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': args.braveKey },
      })
      if (r.ok) {
        const data: any = await r.json()
        const results = (data?.web?.results ?? []).slice(0, 8)
        if (results.length > 0) {
          webContext = `\n\nWEB SEARCH RESULTS (for grounding — don't quote these literally, use them to know what's real):\n` +
            results.map((res: any, i: number) =>
              `${i + 1}. ${res.title ?? '(no title)'}\n   ${res.url ?? ''}\n   ${(res.description ?? '').slice(0, 240)}`,
            ).join('\n')
          grounded = true
        }
      }
    } catch (err: any) {
      // Brave search is best-effort here; suggestions still ship without it.
      console.warn(`[suggestTopicAngles] brave failed: ${err?.message || err}`)
    }
  }

  const userPrompt = `TOPIC: ${args.title}${args.angle ? `\nOperator's existing angle (refine around this — don't drop it): ${args.angle}` : ''}${webContext}${args.profileBlock ?? ''}\n\nPropose 4–6 angles for a video essay on this topic.${args.profileBlock ? ' At least 1-2 of the angles should connect this topic to something the operator ALREADY circles (use the profile + known subjects above). Surface that connection in the framing. The rest can be fresh directions.' : ''}`

  try {
    const r = await callReasoning(env as any, {
      system: ANGLES_SYSTEM,
      user: userPrompt,
      effort: 'high',
      maxTokens: 2048,
    })
    const parsed = parseAnglesJson(r.text)
    return { suggestions: parsed, grounded }
  } catch (err: any) {
    return { suggestions: [], grounded, error: err?.message || String(err) }
  }
}

function parseAnglesJson(text: string): SuggestedAngle[] {
  let t = text.trim()
  if (t.startsWith('```json')) t = t.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  else if (t.startsWith('```')) t = t.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  const firstBrace = t.indexOf('{')
  const lastBrace = t.lastIndexOf('}')
  if (firstBrace > 0 && lastBrace > firstBrace) t = t.slice(firstBrace, lastBrace + 1)
  const obj = JSON.parse(t)
  const arr = Array.isArray(obj?.angles) ? obj.angles : []
  return arr
    .filter((a: any) => a && typeof a.angle === 'string' && typeof a.framing === 'string')
    .map((a: any) => ({
      angle: String(a.angle).trim(),
      framing: String(a.framing).trim(),
      research_questions: Array.isArray(a.research_questions)
        ? a.research_questions.filter((q: any) => typeof q === 'string').map((q: string) => q.trim()).slice(0, 6)
        : [],
    }))
}

function uniqueUrls(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    const u = (raw ?? '').trim()
    if (!u) continue
    if (!/^https?:\/\//i.test(u)) continue
    if (seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}
