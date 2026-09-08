/**
 * Settings.
 *
 * What is here is what the LOG needs: who he is, where the files live, and
 * the two maintenance jobs that fix a recording the pipeline dropped.
 *
 * What used to be here was the essay engine's: a model picker, voice
 * cloning, a Brave Search key, a podcast feed, auto-publishing to a fanout
 * webhook. All of it is gone with the rest of that product. The log does not
 * choose a model on his behalf and does not publish anything anywhere.
 *
 * The one sentence about himself lives here because `/facts` reads it and
 * will not write one — "the log will not draft a sentence about a person."
 */

export const runtime = 'edge'

import { getRequestContext } from '@cloudflare/next-on-pages'
import Link from 'next/link'
import { getDb, findOne } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'
import { headers } from 'next/headers'
import Shell from '@/components/Shell'
import { FixThumbnailsButton } from './FixThumbnailsButton'
import { FixTranscodesButton } from './FixTranscodesButton'
import { OperatorSentence } from './OperatorSentence'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export default async function SettingsPage() {
  const env = getRequestContext().env as unknown as Env
  const h = headers()
  const req = new Request('https://neolog.ai/settings', {
    headers: { cookie: h.get('cookie') || '', 'cf-access-jwt-assertion': h.get('cf-access-jwt-assertion') || '' },
  })

  let operator: { id: string; email: string; handle: string | null; tz: string | null } | null = null
  try {
    const o = await requireOperator(req as any, env)
    const db = await readyDb(getDb(env), 'settings')
    operator = await findOne(
      db,
      `SELECT id, email, handle, tz FROM operator WHERE id = ?`,
      o.id,
    )
  } catch (e) {
    if (!(e instanceof UnauthenticatedError)) throw e
  }

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb"><Link href="/">the log</Link></div>

        <div className="pghead"><h1>Settings</h1></div>
        <div className="stamp">
          {operator && <span>{operator.email}</span>}
          <span>one operator · signed in by a code sent to that address</span>
        </div>

        <div className="lsec"><span>you</span></div>
        <OperatorSentence/>

        <div className="lsec"><span>where it is kept</span></div>
        <div className="doors">
          <span className="d"><span className="n">the recordings</span><span className="w">Cloudflare R2 · neolog-videos</span><span className="c">yours</span></span>
          <span className="d"><span className="n">the log</span><span className="w">Cloudflare D1 · neolog</span><span className="c">yours</span></span>
          <span className="d"><span className="n">the site</span><span className="w">Cloudflare Pages · neolog.ai</span><span className="c">yours</span></span>
        </div>
        <p className="none">
          Nothing here is on anyone else&rsquo;s service. Taking all of it out
          is <Link href="/export">export</Link>; checking a file arrived
          before you delete it locally is <Link href="/clear">safe to clear</Link>.
        </p>

        <div className="lsec"><span>when a recording gets stuck</span></div>
        <div className="doors">
          <span className="d">
            <span className="n">missing a still</span>
            <span className="w">Walk every recording with no thumbnail and run the ffmpeg cascade again. Safe to re-run.</span>
            <span className="c"><FixThumbnailsButton/></span>
          </span>
          <span className="d">
            <span className="n">won&rsquo;t play</span>
            <span className="w">Re-dispatch the H.264 transcode for every recording without one. HEVC from a phone will not play in the browser without it.</span>
            <span className="c"><FixTranscodesButton/></span>
          </span>
        </div>
      </div>
    </Shell>
  )
}
