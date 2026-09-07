'use client'

/**
 * Everything — the one door to the machine layer.
 *
 * `SPEC.md` §3, the rule for the nav: "a stranger chooses between two
 * things. Anything a stranger wouldn't click on — lists, data, feeds —
 * exists at a stable address one click below, unlisted. The site a person
 * reads and the site a machine reads are the same site."
 *
 * So this page is not in the nav, on purpose. It is linked from the log's
 * footer and from the facts, and it lists what is behind every address in
 * the layer with the real count beside it. A door that promised forty
 * things and opened onto an empty list would be worse than no door.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import Stamp from '@/components/Stamp'
import OwnerStrip from '@/components/OwnerStrip'

interface Door { href: string; name: string; what: string; count: number | null; stranger: boolean }
interface Feed { href: string; name: string; what: string }
interface Result {
  counts: { public_entries: number; entries: number; open_questions: number }
  doors: Door[]
  feeds: Feed[]
  last_changed: string | null
}

export default function Everything() {
  const [r, setR] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/public/everything', { cache: 'no-store' })
      if (res.ok) setR(await res.json() as Result)
    } catch { setR(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb"><Link href="/">the log</Link></div>

        <div className="pghead">
          <h1>Everything</h1>
        </div>
        <OwnerStrip signedIn={!!r} />
        <Stamp at={r?.last_changed ?? null} unlisted />

        <p className="none" style={{ paddingBottom: 0 }}>
          This page is not in the menu. Everything below is the same log,
          collected: the entries, the names, the questions and the counts, each
          at an address that does not move. Nothing here was written for it.
        </p>

        {loading && <div className="none">Reading the log.</div>}

        {r && (
          <>
            <div className="lsec">
              <span>what a person reads</span>
            </div>
            <div className="doors">
              {r.doors.filter(d => d.stranger).map(d => <DoorRow key={d.href} d={d} />)}
            </div>

            <div className="lsec">
              <span>the lists</span>
              <b>unlisted</b>
            </div>
            <div className="doors">
              {r.doors.filter(d => !d.stranger).map(d => <DoorRow key={d.href} d={d} />)}
            </div>

            <div className="lsec">
              <span>feeds</span>
            </div>
            <div className="doors">
              {r.feeds.map(f => (
                <a className="d" key={f.href} href={f.href}>
                  <span className="n">{f.name}</span>
                  <span className="w">{f.what}</span>
                  <span className="c none">{f.href}</span>
                </a>
              ))}
            </div>

            <div className="none" style={{ marginTop: 30 }}>
              {r.counts.public_entries === 0
                ? 'Nothing on the log is public yet, so every list here is empty. They stay at these addresses regardless.'
                : `${r.counts.public_entries} of ${r.counts.entries} entries are public. The rest are on the log and not on this side of it.`}
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

function DoorRow({ d }: { d: Door }) {
  return (
    <Link className="d" href={d.href}>
      <span className="n">{d.name}</span>
      <span className="w">{d.what}</span>
      <span className={`c${d.count === null ? ' none' : ''}`}>
        {d.count === null ? '' : d.count === 0 ? 'nothing yet' : d.count}
      </span>
    </Link>
  )
}
