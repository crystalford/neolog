'use client'

/**
 * One document — the thing itself, whole.
 *
 * `writing.html`: "Whole. Never split. Yours from the first word. Above the
 * fence, publishable as-is the moment you say so. The log keeps drafts and
 * dates; **it never touches the text**."
 *
 * So the body is rendered as written, in full, with no summary above it and
 * no reduction offered. Everything the log has to say about it is the two
 * facts it actually knows: when, and who made it.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Shell from '@/components/Shell'
import {
  DOC_WORDS, MADE_BY_WORDS, asKind, asMadeBy, type DocumentRow, type Draft,
} from '@/lib/documents'

interface Result {
  document: DocumentRow
  drafts: Draft[]
  came_from: { id: string; text: string; happened_at: string }[]
}

const day = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DocumentPage() {
  const params = useParams<{ id: string }>()
  const [r, setR] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [showing, setShowing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/documents/${params.id}`, { cache: 'no-store' })
      if (res.ok) setR(await res.json() as Result)
    } catch { setR(null) }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  const patch = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/v2/documents/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) { setEditing(false); setNote(''); await load() }
    } catch { /* the page just doesn't change */ }
    finally { setBusy(false) }
  }, [params.id, load])

  const d = r?.document
  const kind = asKind(d?.kind)
  const madeBy = asMadeBy(d?.made_by)
  const shown = showing === null
    ? d?.body ?? ''
    : (r?.drafts.find(x => x.n === showing)?.body ?? '')

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb">
          <Link href="/">the log</Link>
          <Link href="/writing">writing</Link>
        </div>

        {loading && <div className="none">Getting it.</div>}
        {!loading && !d && <div className="none">No such document.</div>}

        {d && r && (
          <>
            <div className="pghead"><h1>{d.title}</h1></div>
            <div className="stamp">
              <span>{DOC_WORDS[kind].name}</span>
              <span>made by {MADE_BY_WORDS[madeBy]}</span>
              {d.word_count > 0 && <span>{d.word_count.toLocaleString('en-GB')} words</span>}
              {d.draft_count > 1 && <span>{d.draft_count} drafts, all kept</span>}
              <time dateTime={d.finished_at || d.created_at}>{day(d.finished_at || d.created_at)}</time>
              <span>{d.visibility === 'public' ? 'public' : 'private'}</span>
            </div>

            {madeBy === 'operator' && (
              <p className="none" style={{ paddingBottom: 0 }}>
                You wrote this, start to finish. The log transcribed nothing,
                drafted nothing and suggested nothing. It kept the drafts and
                dated them, and that is the whole of its involvement — it says
                so in the file when this is published.
              </p>
            )}

            {editing ? (
              <div className="paste">
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={18} />
                <input
                  className="ti"
                  style={{ borderRadius: 12, borderBottom: '1px solid var(--line-1)', marginTop: 10, fontSize: 14 }}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="In your words, why this draft. Optional, and never the log's."
                />
                <div className="bar">
                  <button className="p" disabled={busy} onClick={() => void patch({ body: draft, note })}>
                    {busy ? 'Keeping it' : 'Keep as a new draft'}
                  </button>
                  <button onClick={() => setEditing(false)}>Not now</button>
                  <span className="say">The draft it replaces stays exactly where it is.</span>
                </div>
              </div>
            ) : (
              <>
                {shown ? (
                  <div className="docbody">{shown}</div>
                ) : d.body_url ? (
                  <p className="none">
                    <a href={d.body_url} target="_blank" rel="noreferrer">{DOC_WORDS[kind].body}</a>
                  </p>
                ) : (
                  <div className="none">Nothing in it yet.</div>
                )}
              </>
            )}

            {r.drafts.length > 1 && (
              <>
                <div className="sh"><span>drafts</span><b>{r.drafts.length}, all kept</b></div>
                <div className="doors">
                  {r.drafts.map(x => (
                    <button
                      className="d"
                      key={x.id}
                      onClick={() => setShowing(x.n === r.drafts[0].n ? null : x.n)}
                      style={{ textAlign: 'left', width: '100%' }}
                    >
                      <span className="n">
                        Draft {x.n}{x.n === r.drafts[0].n ? ' · current' : ''}
                      </span>
                      <span className="w">
                        {x.note || (x.n === 1 ? 'where it started' : 'no note on this one')}
                        <em style={{ display: 'block', fontStyle: 'normal', marginTop: 5, fontSize: 12.5, color: 'var(--fg-4)' }}>
                          {x.word_count.toLocaleString('en-GB')} words · {day(x.created_at)}
                          {showing === x.n ? ' · showing' : ''}
                        </em>
                      </span>
                      <span className="c">{day(x.created_at)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {r.came_from.length > 0 && (
              <>
                <div className="sh"><span>came out of</span></div>
                <div className="doors">
                  {r.came_from.map(e => (
                    <Link className="d" key={e.id} href={`/entry/${e.id}`}>
                      <span className="n">{day(e.happened_at)}</span>
                      <span className="w">{e.text}</span>
                      <span className="c" />
                    </Link>
                  ))}
                </div>
              </>
            )}

            <div className="sh"><span>do something</span></div>
            <div className="paste" style={{ marginTop: 14 }}>
              <div className="bar">
                {!editing && (
                  <button onClick={() => { setDraft(d.body || ''); setShowing(null); setEditing(true) }}>
                    New draft
                  </button>
                )}
                {d.status !== 'finished' && (
                  <button disabled={busy} onClick={() => void patch({ finish: true })}>Finished</button>
                )}
                {d.visibility === 'public' ? (
                  <button disabled={busy} onClick={() => void patch({ unpublish: true })}>Take it down</button>
                ) : (
                  <button className="p" disabled={busy} onClick={() => void patch({ publish: true })}>
                    Publish it, as-is
                  </button>
                )}
                {d.entry_id && <Link href={`/entry/${d.entry_id}`}>on the log</Link>}
              </div>
              <p className="none" style={{ padding: '10px 0 0', fontSize: 13 }}>
                Publishing puts it on the public log whole, with the date and
                who made it in the file. Nothing is read, reduced or
                redrafted on the way out.
              </p>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}
