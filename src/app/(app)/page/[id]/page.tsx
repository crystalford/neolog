'use client'

/**
 * A page — a job, a project, a subject, a person, a place.
 *
 * Translated from `subject.html`. SPEC §11 governs the shape: "A page is the
 * log filtered, not a report about a subject. A person, a project, a place,
 * a month is the same masthead, the same two-column grid, the same day
 * dividers and entry rows, with a compact header on top. Never section
 * headings, a stats row, a chart in the reading column, or closing
 * paragraphs — that reads as a different site the moment you click into it.
 * Everything that is not an entry goes in the rail."
 *
 * So: a compact header, the log's one paragraph, then the log itself,
 * filtered — rendered by the very same components the feed uses.
 *
 * Nothing here asks a question. The count is information; it is never a
 * reason for the log to do anything, and the log never says how many times
 * something has come up as a prompt to do something about it.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { CONSENT_WORDS, asConsent } from '@/lib/correspondence'
import { LogDays } from '@/components/LogRow'
import { LogLightbox, useShots, useRestorePlace } from '@/components/LogLightbox'
import { PAGE_KINDS } from '@/lib/pages'
import { stampFor, type LogEntry } from '@/lib/log-entry'

interface PageDetail {
  id: string
  name: string
  kind: string
  summary: string | null
  summary_author: 'log' | 'operator'
  span: string
  status: string
  entry_count: number
  named_by_system: number
  /** Only meaningful on a person: their answer about their own words. */
  consent: string | null
  consent_at: string | null
  consent_note: string | null
}

interface FirstSaid { id: string; text: string; at: string; href: string }
interface Change { entry_id: string; old_value: string | null; new_value: string | null; created_at: string }

export default function PageView({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [page, setPage] = useState<PageDetail | null>(null)
  const [items, setItems] = useState<LogEntry[]>([])
  const [firstSaid, setFirstSaid] = useState<FirstSaid | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [loading, setLoading] = useState(true)
  const [shotAt, setShotAt] = useState<number | null>(null)
  /** Mentions per year, split warm/cool — `person.html`'s `.span` bar. */
  const [byYear, setByYear] = useState<Record<string, { warm: number; cool: number; n: number }>>({})
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [editingPara, setEditingPara] = useState(false)
  const [para, setPara] = useState('')
  /**
   * The one open recall question about THIS page, if there is one. Read from
   * the same endpoint the log's rail reads — nothing is generated here, and
   * a page with no question shows no card.
   */
  const [ask, setAsk] = useState<{ id: string; question: string; because: string | null } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/pages/${params.id}`, { cache: 'no-store' })
      if (!res.ok) { setPage(null); return }
      const data = await res.json() as {
        page: PageDetail; items: LogEntry[]
        first_said?: FirstSaid | null; changes?: Change[]
        by_year?: Record<string, { warm: number; cool: number; n: number }>
      }
      setPage(data.page)
      setItems(data.items || [])
      setFirstSaid(data.first_said || null)
      setChanges(data.changes || [])
      setByYear(data.by_year || {})
    } catch { setPage(null) }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  const loadAsk = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/recall', { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json() as {
        questions: { id: string; question: string; because: string | null; target_kind: string | null; target_id: string | null }[]
      }
      const mine = (j.questions || []).find(
        q => q.target_kind === 'page' && q.target_id === params.id,
      )
      setAsk(mine ? { id: mine.id, question: mine.question, because: mine.because } : null)
    } catch { setAsk(null) }
  }, [params.id])
  useEffect(() => { void loadAsk() }, [loadAsk])

  const closeAsk = useCallback(async (body: Record<string, unknown>) => {
    if (!ask) return
    setAsk(null)
    try {
      await fetch('/api/v2/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ask.id, ...body }),
      })
    } catch { /* the card is already gone; the next load says the truth */ }
  }, [ask])

  const patch = useCallback(async (body: Record<string, unknown>) => {
    await fetch(`/api/v2/pages/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await load()
  }, [params.id, load])

  const shots = useShots(items)
  const openShot = useCallback((url: string) => {
    const i = shots.findIndex(sh => sh.url === url)
    setShotAt(i >= 0 ? i : null)
  }, [shots])
  useRestorePlace(!loading && items.length > 0)

  /**
   * The years this page comes up in, oldest first, with the warm/cool split
   * the API derived from each entry's two times. Years with nothing are NOT
   * filled in — a gap in the bar is a year he did not mention it, and
   * drawing a zero-height bar there would imply the log looked and found
   * none, which is the same thing said less clearly.
   */
  const years = Object.entries(byYear)
    .map(([y, v]) => ({ y: Number(y), ...v }))
    .filter(y => !isNaN(y.y))
    .sort((a, b) => a.y - b.y)
  const yearMax = Math.max(1, ...years.map(y => y.n))


  if (loading) return <Shell><div className="logpage pg-person" /></Shell>
  if (!page) {
    return (
      <Shell>
        <div className="logpage pg-person">
          <div className="crumb"><Link href="/pages">the index</Link></div>
          <div className="none">There&rsquo;s no page here.</div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell active="index">
      <div className="logpage pg-person">
        <div className="crumb">
          <Link href="/">the log</Link>
          <span>·</span>
          <Link href="/pages">the index</Link>
        </div>

        {/* `person.html`: the name and its facts sit above the grid, not
            inside the column — the page is about the thing, and the thing is
            named before the layout begins. */}
        <div className="phead">
              {renaming ? (
                <>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', maxWidth: 620, background: 'var(--bg-2)',
                      border: '1px solid var(--line-1)', borderRadius: 10,
                      color: 'var(--fg)', padding: '10px 14px', fontSize: 24,
                      fontWeight: 300, letterSpacing: '-0.9px',
                      fontFamily: 'var(--font-body)',
                    }}
                  />
                  <div className="fixrow" style={{ marginTop: 10 }}>
                    <button
                      className="p"
                      onClick={async () => {
                        if (name.trim()) await patch({ name: name.trim() })
                        setRenaming(false)
                      }}
                    >Save the name</button>
                    <button onClick={() => setRenaming(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <h1>{page.name}</h1>
              )}

        <div className="meta">
                <span>a {page.kind}</span>
                {page.span && <span><b>{page.span}</b></span>}
                <span>
                  {page.entry_count} {page.entry_count === 1 ? 'entry' : 'entries'}
                </span>
                <span>{page.status}</span>
                {page.named_by_system === 1 && <span>named by the log</span>}
                {/* `messages.html`: the state is "shown on their page, and
                    enforced everywhere their words appear." Read-only here
                    — it is set on the conversation it came out of, where
                    the words it governs are in front of him. */}
                {page.kind === 'person' && (
                  <span>{CONSENT_WORDS[asConsent(page.consent)].name.toLowerCase()}</span>
                )}
              </div>
              {page.kind === 'person' && (
                <p className="none" style={{ padding: '10px 0 0', fontSize: 13 }}>
                  {CONSENT_WORDS[asConsent(page.consent)].what}
                  {page.consent_at
                    ? ` Set ${new Date(page.consent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${page.consent_note ? ` — ${page.consent_note}` : ''}.`
                    : ' Never asked; this is the default.'}
                </p>
              )}
        </div>

        {/* ── When this page comes up ────────────────────────────────
            `person.html`'s `.span`: a bar per year, split warm and cool.
            Both halves are facts the log already holds — every entry
            carries two times, so a line logged the day it happened was said
            as it happened, and one logged later was written from memory.
            Nothing is inferred: an entry with no logged time counts toward
            the year and toward neither half. */}
        {years.length > 0 && (
          <div className="span">
            <div className="k">
              <span>When {page.kind === 'person' ? 'they come' : 'it comes'} up</span>
              <span>
                {years[0].y}{years.length > 1 ? ` – ${years[years.length - 1].y}` : ''}
                {' · warm = from memory · cool = said as it happened'}
              </span>
            </div>
            <div className="yrs">
              {years.map(y => (
                <i
                  key={y.y}
                  style={{
                    height: `${Math.max(8, Math.round((y.n / yearMax) * 100))}%`,
                    background: y.warm > y.cool ? 'var(--t-ochre)' : 'var(--t-steel)',
                  }}
                  title={`${y.y} — ${y.n} ${y.n === 1 ? 'mention' : 'mentions'}`
                    + (y.warm ? `, ${y.warm} from memory` : '')
                    + (y.cool ? `, ${y.cool} as it happened` : '')}
                />
              ))}
            </div>
            <div className="yl">
              <span>{years[0].y}</span>
              <span>{years[years.length - 1].y}</span>
            </div>
          </div>
        )}

        <div className="grid">
          <main>
            {/* The log's one-paragraph version — rewritten as things attach,
                always his to edit, and never shown as his words. */}
            {(page.summary || editingPara) && (
              <div className="para">
                {editingPara ? (
                  <>
                    <textarea value={para} onChange={e => setPara(e.target.value)} autoFocus />
                    <div className="fixrow" style={{ marginTop: 10 }}>
                      <button
                        className="p"
                        onClick={async () => { await patch({ summary: para }); setEditingPara(false) }}
                      >Save</button>
                      <button onClick={() => setEditingPara(false)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    {page.summary}
                    <span className="who">
                      {page.summary_author === 'operator'
                        ? 'your words · you edited this'
                        : "the log's one-paragraph version · from the entries below, and yours to edit"}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* `idea.html` and `term.html`: a page of a THOUGHT needs two
                things a page of a person does not — when it was first said,
                and every time he has changed it since. Both are read from
                rows that already exist, so neither can be wrong in a way the
                entries are not. */}
            {firstSaid && (
              <div className="firstsaid">
                <div className="fk">first said</div>
                <Link className="fv" href={firstSaid.href}>
                  {firstSaid.text.length > 200 ? `${firstSaid.text.slice(0, 198)}…` : firstSaid.text}
                  <em>{stampFor(firstSaid.at, 'exact')}</em>
                </Link>
              </div>
            )}

            {changes.length > 0 && (
              <div className="revs" style={{ marginTop: 16 }}>
                <div className="who">
                  Changed {changes.length === 1 ? 'once' : `${changes.length} times`} since
                </div>
                {changes.map((c, i) => (
                  <div className="rev" key={i}>
                    <span className="rt">
                      {new Date(c.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                    <span className="rb">
                      {c.old_value && <span className="was">{c.old_value}</span>}
                      <em>both wordings kept</em>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* The log, filtered. Same rows, same day dividers, same
                everything — a page is a way of looking at the log, not a
                second kind of screen. */}
            <div id="feed" style={{ marginTop: 26 }}>
              <LogDays items={items} onImage={openShot} />
              {items.length === 0 && (
                <div className="none">
                  Nothing is attached to this page yet.
                </div>
              )}
            </div>
          </main>

          <aside className="rail">
            {/* `person.html` puts the page's own open question at the top of
                its rail, in a warm-bordered card. It is the one recall
                question that is ABOUT this page — the log named it, and this
                is where he can see what is under the name before answering.
                Recall's own ceiling of three open questions governs; nothing
                new is asked because this page was opened.
                ⚠️ The design's third button is "Talk it out", which is the
                offer and stays below the fence. "Don't remember" is a
                complete answer and closes the question for good. */}
            {ask && (
              <div className="rc warm">
                <div className="h">One question <span>from what you wrote</span></div>
                <div className="i">
                  <b>{ask.question}</b>
                  {ask.because && <em>{ask.because}</em>}
                  <div className="a">
                    <button
                      className="p"
                      onClick={() => { setName(page.name); setRenaming(true) }}
                    >Name it</button>
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); void closeAsk({ dont_remember: true }) }}
                    >don&rsquo;t remember</a>
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); void closeAsk({ dismiss: true }) }}
                    >leave it</a>
                  </div>
                </div>
              </div>
            )}

            <div className="rc">
              <div className="h">Fix it</div>

              <div className="i">
                <b>Wrong name?</b>
                <em>
                  {page.named_by_system === 1
                    ? "The log guessed this name. Change it — everything attached follows."
                    : 'You named this. Change it any time.'}
                </em>
                <div className="fixrow">
                  <button onClick={() => { setName(page.name); setRenaming(true) }}>
                    Rename it
                  </button>
                </div>
              </div>

              <div className="i">
                <b>Wrong kind?</b>
                <em>The kind is a label. It changes nothing else about the page.</em>
                <select
                  value={page.kind}
                  onChange={e => void patch({ kind: e.target.value })}
                >
                  {PAGE_KINDS.map(k => <option key={k} value={k}>a {k}</option>)}
                </select>
              </div>

              <div className="i">
                <b>The paragraph</b>
                <em>
                  {page.summary
                    ? 'Written by the log from what is attached. Edit it and it becomes yours.'
                    : 'Nothing written yet. You can write it yourself.'}
                </em>
                <div className="fixrow">
                  <button onClick={() => { setPara(page.summary || ''); setEditingPara(true) }}>
                    {page.summary ? 'Edit it' : 'Write it'}
                  </button>
                </div>
              </div>

              {/* "Not a page, just a thought" — and the log won't make it
                  again from that phrase. The entries stay exactly where
                  they were; a page was only ever a way of looking at them. */}
              <div className="i">
                <b>Not a page?</b>
                <em>
                  Removing it leaves every entry alone. A page is a way of
                  looking at the log, not a container things live inside.
                </em>
                <div className="fixrow">
                  <button
                    onClick={async () => { await patch({ not_a_page: true }); router.push('/pages') }}
                  >Not a page, just a thought</button>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <LogLightbox shots={shots} index={shotAt} onClose={() => setShotAt(null)} onIndex={setShotAt} />
      </div>
    </Shell>
  )
}
