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
import { LogDays } from '@/components/LogRow'
import { LogLightbox, useShots, useRestorePlace } from '@/components/LogLightbox'
import { PAGE_KINDS } from '@/lib/pages'
import type { LogEntry } from '@/lib/log-entry'

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
}

export default function PageView({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [page, setPage] = useState<PageDetail | null>(null)
  const [items, setItems] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [shotAt, setShotAt] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [editingPara, setEditingPara] = useState(false)
  const [para, setPara] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/pages/${params.id}`, { cache: 'no-store' })
      if (!res.ok) { setPage(null); return }
      const data = await res.json() as { page: PageDetail; items: LogEntry[] }
      setPage(data.page)
      setItems(data.items || [])
    } catch { setPage(null) }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

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

  if (loading) return <Shell><div className="logpage" /></Shell>
  if (!page) {
    return (
      <Shell>
        <div className="logpage">
          <div className="crumb"><Link href="/pages">the index</Link></div>
          <div className="none">There&rsquo;s no page here.</div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell active="index">
      <div className="logpage">
        <div className="crumb">
          <Link href="/">the log</Link>
          <span>·</span>
          <Link href="/pages">the index</Link>
        </div>

        <div className="grid">
          <main>
            <div className="pghead">
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

              <div className="pgmeta">
                <span>a {page.kind}</span>
                {page.span && <span><b>{page.span}</b></span>}
                <span>
                  {page.entry_count} {page.entry_count === 1 ? 'entry' : 'entries'}
                </span>
                <span>{page.status}</span>
                {page.named_by_system === 1 && <span>named by the log</span>}
              </div>
            </div>

            {/* The log's one-paragraph version — rewritten as things attach,
                always his to edit, and never shown as his words. */}
            {(page.summary || editingPara) && (
              <div className="pgpara">
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
