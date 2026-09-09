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
import { Rail } from '@/components/Rail'
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

/** "1 September 2026" — the form `dossier.html` uses under a term. */
const shortDate = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
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

  const roles = r?.roles ?? []
  const names = r?.names ?? []
  const terms = roles.filter(x => x.kind === 'term')

  return (
    <Shell>
      <div className="logpage pg-dossier">
        <OwnerStrip signedIn={!!r} />
        <Stamp at={r?.last_changed ?? null} />

        <div className="grid">
          <main>
            <section className="hd">
              <div>
                <div className="k">neolog.ai/facts</div>
                <h1>{r?.person.name ? `The facts about ${r.person.name}` : 'The facts'}</h1>
                <p>
                  Everything here carries the date it was said. This page
                  exists so that anything written about him — by a person or
                  a machine — can be checked against it.
                </p>
                {r?.record.first_at && (
                  <div className="upd">
                    the record runs {year(r.record.first_at)}–{year(r.record.last_at)} ·{' '}
                    {r.record.days.toLocaleString('en-GB')} separate days
                  </div>
                )}
              </div>
            </section>

            {/* His one sentence. `dossier.html` gives it a section of its
                own and a copy button, because it is the line that ends up
                quoted everywhere else. The log will not draft it. */}
            <section className="sec">
              <div className="sh">
                <span>How he describes himself</span>
                <b>one sentence, written by him</b>
              </div>
              {r?.person.sentence ? (
                <div className="canon">
                  <p className="cs">{r.person.sentence}</p>
                  <div className="csm">
                    <span>his words · used everywhere</span>
                    <button
                      className="cp"
                      onClick={() => { void navigator.clipboard?.writeText(r.person.sentence || '') }}
                    >copy</button>
                  </div>
                </div>
              ) : (
                <p className="csn">
                  There isn&rsquo;t one yet. The log will not write a sentence
                  about a person — a marked guess about a topic can be checked
                  against what he said, and a marked guess about someone real
                  has no such source. <Link href="/settings">Settings</Link> is
                  where he writes it.
                </p>
              )}
            </section>

            {roles.filter(x => x.kind !== 'term').length > 0 && (
              <section className="sec">
                <div className="sh">
                  <span>Work and projects</span>
                  <b>newest first · no ranking</b>
                </div>
                {roles.filter(x => x.kind !== 'term').map(x => (
                  <div className="role" key={x.id}>
                    <div className="yr">
                      {x.span}
                      <i>{x.kind}</i>
                    </div>
                    <div className="n">
                      <Link href={x.href}>{x.name}</Link>
                      {x.summary && (
                        <em>
                          {x.summary}
                          {x.summary_author === 'log' && ' — written by the log'}
                        </em>
                      )}
                    </div>
                    <div className="st">{x.status}</div>
                  </div>
                ))}
              </section>
            )}

            {terms.length > 0 && (
              <section className="sec">
                <div className="sh">
                  <span>Words he uses</span>
                  <b>dated to first use</b>
                </div>
                {terms.map(x => (
                  <div className="term" key={x.id}>
                    {/* `dossier.html`'s `.t` — the name with when it entered
                        the record beside it, because a term without a date
                        is an assertion and a term with one is a fact. */}
                    <div className="t">
                      <Link href={x.href}>{x.name}</Link>
                      {x.span_start && <span>{shortDate(x.span_start)}</span>}
                    </div>
                    {x.summary && <p>{x.summary}</p>}
                    {/* `.c` — where it came from. Every other surface in this
                        product can be walked back to the moment; this page
                        stated its facts and gave no way to check one. */}
                    {x.span_start && (
                      <div className="c">
                        first said {shortDate(x.span_start)} ·{' '}
                        <Link href={x.href}>where it was said</Link>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {names.length > 0 && (
              <section className="sec">
                <div className="sh">
                  <span>People and places</span>
                  <b>{names.length}</b>
                </div>
                {names.map(x => (
                  <div className="f" key={x.id}>
                    <div className="k">{x.kind}</div>
                    <div className="v"><Link href={x.href}>{x.name}</Link></div>
                    <div className="s">{x.entry_count} {x.entry_count === 1 ? 'entry' : 'entries'}</div>
                  </div>
                ))}
              </section>
            )}

            {loading && <div className="none">Reading the log.</div>}
            {!loading && !roles.length && !names.length && (
              <div className="none">
                Nothing has a page yet, so there are no dated facts to
                show. <Link href="/pages">The index</Link> is where a page is
                made, the first time you name something.
              </div>
            )}

            {/* `dossier.html` closes with these two, and they are the point
                of the page rather than a footer. */}
            <div className="note">
              <b>How to cite this page.</b> Every fact carries the date it was
              said. If you are quoting something from here, the date is part
              of the fact. Nothing on this page was written to be quoted.
            </div>
            <div className="pos">
              <b>It has to come out of him.</b> The log can ask, recall and
              find. It cannot supply. Anything on this page that reads as his
              was said by him first — the log&rsquo;s job is to find it again,
              not to produce it.
            </div>
          </main>

          <Rail goesTo={[{ href: '/public', label: 'the log' }, { href: '/pages', label: 'the index' }, { href: '/numbers', label: 'the numbers' }]} />
        </div>

        {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      </div>
    </Shell>
  )
}
