/**
 * Settings.
 *
 * What is here is what the LOG needs: who he is, where the files live, and
 * the three maintenance jobs that fix a recording the pipeline dropped.
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
import { FreeStuckButton } from './FreeStuckButton'
import { OperatorSentence } from './OperatorSentence'
import { Retranscribe } from './Retranscribe'
import { StartAgain } from './StartAgain'

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
        <div className="back"><Link href="/">the log</Link></div>

        <div className="pghead"><h1>Settings</h1></div>
        <div className="stamp">
          {operator && <span>{operator.email}</span>}
          <span>one operator · signed in by a code sent to that address</span>
        </div>

        <div className="sh"><span>you</span></div>
        <OperatorSentence/>

        <div className="sh"><span>where it is kept</span></div>
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

        <div className="sh"><span>the recordings, and what the log has read</span></div>
        <Retranscribe/>

        <div className="sh"><span>when a recording gets stuck</span></div>
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
          {/* The healer worker was written to do this on a five-minute cron
              and its cron is off — deliberately, as ambient cost on a quiet
              log. That is the wrong trade for the one event this product is
              built around, so the job is a button until he decides
              otherwise. It counts before it changes anything. */}
          <span className="d">
            <span className="n">wedged half-way</span>
            <span className="w">A recording can stop mid-transcode, mid-Whisper or mid-read and sit there. This frees the ones that have not moved in twenty minutes so you can send them again. Nothing is deleted and the file is untouched.</span>
            <span className="c"><FreeStuckButton/></span>
          </span>
        </div>

        {/* Last, and behind a phrase he has to type. The operator has no
            terminal — this session is his runtime — so the one irreversible
            act in the product has to be a button, and it has to say what it
            keeps before it says what it destroys. */}
        <div className="sh">
          <span>start again</span>
          <b>irreversible</b>
        </div>
        <StartAgain/>
      </div>
    </Shell>
  )
}
