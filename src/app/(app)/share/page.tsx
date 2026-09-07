'use client'

/**
 * The share sheet — one of the ways in.
 *
 * `connections.html` lists eight doors: the box, the phone, hands-free from
 * earbuds, the share sheet, a browser button, forwarding. The operator's own
 * requirement is the reason any of them matter: *"it almost has to be an app
 * because it has to just be very easy for me to capture this stuff."*
 *
 * This is the share-sheet door. The web app manifest declares a
 * `share_target` pointing here, so on a phone with neolog installed, "Share"
 * from any app lists neolog and lands on this page with the text or link
 * already in the box.
 *
 * It still obeys rule 6 — nothing is asked at the moment of input. The shared
 * thing arrives in the composer, and one press puts it in.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { useIntake } from '@/components/useIntake'

export default function SharePage() {
  const intake = useIntake()
  const { text, setText, canSend, submit, receipt } = intake
  const [ready, setReady] = useState(false)

  // Whatever the share sheet handed over, in the box, already.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const parts = [p.get('title'), p.get('text'), p.get('url')]
      .map(v => (v || '').trim())
      .filter(Boolean)
    // A share often repeats the URL inside the text; don't paste it twice.
    const seen = new Set<string>()
    const joined = parts.filter(v => (seen.has(v) ? false : (seen.add(v), true))).join('\n')
    if (joined) setText(joined)
    setReady(true)
  }, [setText])

  const put = useCallback(async () => { await submit() }, [submit])

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb"><Link href="/">the log</Link></div>

        <div className="pghead">
          <h1>{receipt ? 'In.' : 'Put this in the log.'}</h1>
        </div>

        {receipt ? (
          <div className="pgpara" style={{ marginTop: 20 }}>
            {receipt.line}
            <span className="who">
              <Link href="/">back to the log</Link> · or share something else
            </span>
          </div>
        ) : (
          <div className="comp" style={{ marginTop: 20, maxWidth: 660 }}>
            <div className="in">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="What happened?"
                autoFocus={ready}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void put() }
                }}
                style={{ minHeight: 120 }}
              />
              <div className="bar2">
                <span style={{ fontSize: 11.5, color: 'var(--fg-4)', paddingLeft: 4 }}>
                  shared from another app
                </span>
                <button
                  className="send"
                  style={{ marginLeft: 'auto' }}
                  disabled={!canSend}
                  onClick={() => void put()}
                  title="Put it in · Enter"
                >
                  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 13.5v-11M3.5 7 8 2.5 12.5 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
