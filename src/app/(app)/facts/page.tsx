'use client'

/**
 * The facts — `dossier.html`, "the dated facts... and one sentence written
 * by the operator."
 *
 * Called the facts rather than "about" because `/about` is already the
 * page that explains the system, and because that is what `dossier.html`
 * calls itself in its own title. A person landing here gets what the log can
 * state; a machine gets Person schema built from the same rows.
 *
 * ── The sentence ─────────────────────────────────────────────────────────
 *
 * `dossier.html` allows a sentence the log drafted, marked as drafted. This
 * page does not draft one. A marked guess about a topic can be checked
 * against what he said; a marked guess about a PERSON has no such source,
 * and the person is real. His sentence, or the page says there isn't one.
 *
 * ── No ranking ───────────────────────────────────────────────────────────
 *
 * Roles are in date order, newest first, and there is no score, no
 * "importance", no featured row. §0: the log never ranks.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import Stamp from '@/components/Stamp'
import OwnerStrip from '@/components/OwnerStrip'

interface Row {
  id: string; name: string; kind: string
  summary: string | null; summary_author: string
  entry_count: number; status: string; span: string
  span_start: string | null; span_end: string | null
  href: string
}
interface Result {
  person: { name: string | null; handle: string | null; sentence: string | null }
  roles: Row[]
  names: Row[]
  record: { first_at: string | null; last_at: string | null; days: number }
  last_changed: string | null
}

const year = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : String(d.getUTCFullYear())
}

export default function Facts() {
  const [r, setR] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/public/facts', { cache: 'no-store' })
      if (res.ok) setR(await res.json() as Result)
    } catch { setR(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const jsonLd = useMemo(() => {
    if (!r?.person.name) return null
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: r.person.name,
      ...(r.person.sentence ? { description: r.person.sentence } : {}),
      // Only what has a row behind it. No inferred affiliations.
      ...(r.roles.length
        ? { knowsAbout: r.roles.map(x => x.name) }
        : {}),
    })
  }, [r])

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb">
          <Link href="/">the log</Link>
          <Link href="/everything">everything</Link>
        </div>

        <div className="pghead">
          <h1>{r?.person.name || 'The facts'}</h1>
        </div>
        <OwnerStrip signedIn={!!r} />
        <Stamp at={r?.last_changed ?? null} />

        {loading && <div className="none">Reading the log.</div>}

        {r && (
          <>
            {r.person.sentence ? (
              <p className="none" style={{ fontSize: 16.5, color: 'var(--fg-1)', paddingBottom: 0 }}>
                {r.person.sentence}
              </p>
            ) : (
              <p className="none" style={{ paddingBottom: 0 }}>
                No sentence here yet — the log will not write one about a
                person. <Link href="/settings">Settings</Link> is where you
                write it.
              </p>
            )}

            {r.record.first_at && (
              <p className="none" style={{ paddingTop: 14 }}>
                The record runs from {year(r.record.first_at)} to {year(r.record.last_at)},
                with something on {r.record.days.toLocaleString('en-GB')} separate days.
                {' '}<Link href="/numbers">The rest of the counting</Link> is on its own page.
              </p>
            )}

            {r.roles.length > 0 && (
              <>
                <div className="lsec">
                  <span>work and projects</span>
                  <b>newest first</b>
                </div>
                {r.roles.map(x => (
                  <div className="item" key={x.id}>
                    <div className="x"><Link href={x.href}>{x.name}</Link></div>
                    <div className="m">
                      <span>{x.span}</span>
                      <span>{x.status}</span>
                      <span>{x.entry_count} {x.entry_count === 1 ? 'entry' : 'entries'}</span>
                    </div>
                    {x.summary && (
                      <div className="p">
                        {x.summary}
                        {x.summary_author === 'log' && (
                          <em style={{ display: 'block', fontStyle: 'normal', marginTop: 7, fontSize: 12.5, color: 'var(--fg-4)' }}>
                            written by the log
                          </em>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {r.names.length > 0 && (
              <>
                <div className="lsec">
                  <span>people and places</span>
                  <b>{r.names.length}</b>
                </div>
                {r.names.map(x => (
                  <div className="item" key={x.id}>
                    <div className="x"><Link href={x.href}>{x.name}</Link></div>
                    <div className="m">
                      <span>{x.span}</span>
                      <span>{x.entry_count} {x.entry_count === 1 ? 'entry' : 'entries'}</span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {!r.roles.length && !r.names.length && (
              <div className="none">
                Nothing has a page yet, so there are no dated facts to
                show. <Link href="/pages">The index</Link> is where the log
                makes them out of what you have already said.
              </div>
            )}
          </>
        )}

        {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      </div>
    </Shell>
  )
}
