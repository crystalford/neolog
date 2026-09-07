'use client'

/**
 * Every way in.
 *
 * `connections.html` lists eight doors — the box, the phone, hands-free from
 * earbuds, the share sheet, a browser button, forwarding, and the automatic
 * sources. The operator's own requirement is why they matter: *"it almost
 * has to be an app because it has to just be very easy for me to capture
 * this stuff."*
 *
 * This page says which of them exist, and — the part that matters — which
 * don't. A list of doors that includes ones that aren't built is worse than
 * a short list, because he'd try one and find nothing there.
 *
 * The rule from SPEC §1 governs everything auto: "Capture when told to.
 * Every auto-source is explicit, per-source, revocable. Nothing records
 * silently." None of the automatic sources are built, and this page does not
 * imply otherwise.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

export default function WaysIn() {
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    setInstalled(window.matchMedia?.('(display-mode: standalone)')?.matches ?? false)
  }, [])

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb"><Link href="/">the log</Link></div>

        <div className="pghead">
          <h1>Every way in.</h1>
          <div className="pgmeta">
            <span>
              What&rsquo;s built, and what isn&rsquo;t. A door that
              isn&rsquo;t there is worse than one that was never listed.
            </span>
          </div>
        </div>

        <div className="idxband"><b>Built</b></div>

        <div className="way-row">
          <div className="wk">The box</div>
          <div className="wv">
            Type or paste into the composer on <Link href="/">the log</Link>.
            One line or a whole chapter — the same box, the same action.
          </div>
        </div>

        <div className="way-row">
          <div className="wk">Full screen</div>
          <div className="wv">
            <Link href="/now">/now</Link> — nothing on the screen but the box.
            Talk, type, or drop something in.
          </div>
        </div>

        <div className="way-row">
          <div className="wk">Talk</div>
          <div className="wv">
            The microphone in either composer. It records, uploads, and
            transcribes on arrival; the words become the entry and the audio
            is kept.
          </div>
        </div>

        <div className="way-row">
          <div className="wk">Files, photos, video</div>
          <div className="wv">
            Drag in, paste, or pick. Each is placed by its own clock and
            checked against what your device sent — see{' '}
            <Link href="/clear">what&rsquo;s safe to clear</Link>.
          </div>
        </div>

        <div className="way-row">
          <div className="wk">On your phone</div>
          <div className="wv">
            Open neolog in the phone&rsquo;s browser and add it to the home
            screen. It opens straight into <Link href="/now">/now</Link>.
            {installed && ' You are using it that way now.'}
          </div>
        </div>

        <div className="way-row">
          <div className="wk">The share sheet</div>
          <div className="wv">
            Once it is on the home screen, neolog appears in any app&rsquo;s
            Share. What you share lands in the box, ready to go in.
            <em>Android and desktop Chrome support this; iOS does not yet.</em>
          </div>
        </div>

        <div className="idxband"><b>Not built</b>and the page says so rather than implying otherwise</div>

        <div className="way-row off">
          <div className="wk">Hands-free from earbuds</div>
          <div className="wv">Nothing listens. There is no always-on capture and no wake word.</div>
        </div>

        <div className="way-row off">
          <div className="wk">Forwarding by email</div>
          <div className="wv">There is no inbox address to forward to.</div>
        </div>

        <div className="way-row off">
          <div className="wk">Camera roll, calendar, messages</div>
          <div className="wv">
            No automatic source is connected. When one is, SPEC §1 governs it:
            explicit, per-source, revocable, and turned on only after showing
            the first ten real things it would take. Nothing records silently.
          </div>
        </div>

        <div className="quiet" style={{ marginTop: 22 }}>
          Everything already recorded is a way in too — the{' '}
          <Link href="/">relog</Link> puts what you said in three hundred
          existing recordings onto the log, at the second you said it.
        </div>
      </div>
    </Shell>
  )
}
