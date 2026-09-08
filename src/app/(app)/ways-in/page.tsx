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
import { Rail } from '@/components/Rail'

export default function WaysIn() {
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    setInstalled(window.matchMedia?.('(display-mode: standalone)')?.matches ?? false)
  }, [])

  return (
    <Shell>
      <div className="logpage pg-connections">
        <div className="back"><Link href="/">the log</Link></div>

        <section className="top">
          <h1>Every way something gets into the log.</h1>
          <p className="sub">
            What&rsquo;s built, and what isn&rsquo;t. A door that
            isn&rsquo;t there is worse than one that was never listed.
          </p>
        </section>

        <div className="grid">
          <main>

        <div className="sh">
          <span>By hand, from wherever you are</span>
          <b>the same box, reached six ways · every one ends in the same one-line receipt</b>
        </div>

        {/* `connections.html`'s `.ways` is the CONTAINER and `.w` is a door —
            a name, where it lives, and what it does. One grid, not a wrapper
            per row. */}
        <div className="ways">
          <div className="w">
            <b>The box</b>
            <i>on <Link href="/">the log</Link></i>
            <p>Type or paste. One line or a whole chapter — the same box, the same action.</p>
          </div>
          <div className="w">
            <b>Full screen</b>
            <i>on <Link href="/now">now</Link></i>
            <p>Nothing on the screen but the box. Talk, type, or drop something in.</p>
          </div>
          <div className="w">
            <b>Talk</b>
            <i>the microphone in either composer</i>
            <p>
              It records, uploads and transcribes on arrival. The words become
              the entry and the audio is kept.
            </p>
          </div>
          <div className="w">
            <b>Files, photos, video</b>
            <i>drag in, paste, or pick</i>
            <p>
              Each is placed by its own clock and checked against what your
              device sent — see <Link href="/clear">what&rsquo;s safe to clear</Link>.
            </p>
          </div>
          <div className="w">
            <b>On your phone</b>
            <i>added to the home screen</i>
            <p>
              Open neolog in the phone&rsquo;s browser and add it. It opens
              straight into <Link href="/now">now</Link>.
              {installed && ' You are using it that way now.'}
            </p>
          </div>
          <div className="w">
            <b>The share sheet</b>
            <i>Android and desktop Chrome · iOS not yet</i>
            <p>
              Once it is on the home screen, neolog appears in any app&rsquo;s
              Share. What you share lands in the box, ready to go in.
            </p>
          </div>
        </div>

        {/* The other half of `connections.html` is seven sources that bring
            things in on their own, each a switch. None is built, and the page
            says which and why rather than leaving a reader to assume. */}
        <div className="sh">
          <span>On their own</span>
          <b>nothing is connected, and nothing listens</b>
        </div>

        <div className="ways">
          <div className="w off">
            <b>Hands-free from earbuds</b>
            <i>not built</i>
            <p>Nothing listens. There is no always-on capture and no wake word.</p>
          </div>
          <div className="w off">
            <b>Forwarding by email</b>
            <i>not built</i>
            <p>There is no inbox address to forward to.</p>
          </div>
          <div className="w off">
            <b>Camera roll, calendar, messages</b>
            <i>not built</i>
            <p>
              No automatic source is connected. When one is, SPEC §1 governs
              it: explicit, per-source, revocable, and turned on only after
              showing the first ten real things it would take. Nothing records
              silently.
            </p>
          </div>
        </div>

        <div className="off2">
          Off means nothing new arrives from that door. It never means
          &ldquo;remove what already came&rdquo; — nothing on the log is
          removed by turning a way in off.
        </div>

        <div className="note2">
          None of these is a different product. They are doors to one box, and
          every one of them ends in the same one-line receipt.
        </div>

        <div className="quiet" style={{ marginTop: 22 }}>
          Everything already recorded is a way in too — the{' '}
          <Link href="/">relog</Link> puts what you said in three hundred
          existing recordings onto the log, at the second you said it.
        </div>
            {/* `connections.html`'s closing rule, which is the reason
                there are eight doors rather than one. */}
            <div className="rules">
              <b>Eight doors, one receipt.</b> However something gets in —
              typed, spoken, shared, forwarded — what comes back is the same
              single line saying what happened, and one undo. Nothing asks a
              question at the moment of input.
            </div>
          </main>

          <Rail goesTo={[
            { href: '/', label: 'the log' },
            { href: '/now', label: 'the box, full screen' },
            { href: '/triage', label: 'what arrived' },
          ]} />
        </div>
      </div>
    </Shell>
  )
}
