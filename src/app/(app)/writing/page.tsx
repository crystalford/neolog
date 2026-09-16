'use client'

/**
 * Writing — every made thing, in one shape.
 *
 * `writing.html`: "a document is a document · **kind and who-made-it are
 * fields**." So this is one table, not eight lists, and the two fields that
 * actually differ are columns on it.
 *
 * Who made it is never blank and never implied. A report the log drafted and
 * he kept says so on its row, next to an essay that says "you". That column
 * is the disclosure, and it is why the essay's claim means anything.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import {
  DOC_KINDS, DOC_WORDS, MADE_BY_WORDS, asKind, asMadeBy, type DocKind,
} from '@/lib/documents'

interface Doc {
  id: string; kind: string; title: string; made_by: string; status: string
  word_count: number; draft_count: number
  page_id: string | null; page_name: string | null
  visibility: string; finished_at: string | null; created_at: string
}

const day = (s: string) => {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** `writing.css` colours the made-by tag: you · ai · log. */
const MADE_BY_CLASS: Record<string, string> = {
  operator: 'you',
  operator_with_log: 'ai',
  log_drafted_kept: 'ai',
  log: 'log',
}

export default function Writing() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [kind, setKind] = useState<DocKind>('essay')
  const [mine, setMine] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/documents', { cache: 'no-store' })
      if (res.ok) setDocs(((await res.json()) as { documents: Doc[] }).documents || [])
    } catch { setDocs([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const keep = useCallback(async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/v2/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, body: text, kind,
          made_by: mine ? 'operator' : 'log_drafted_kept',
        }),
      })
      if (res.ok) {
        const j = await res.json() as { word_count: number }
        setMsg(`Kept whole. ${j.word_count.toLocaleString('en-GB')} words, one entry on the log, nothing split.`)
        setTitle(''); setText(''); setOpen(false)
        await load()
      } else setMsg('that did not go in')
    } catch { setMsg('that did not go in') }
    finally { setBusy(false) }
  }, [title, text, kind, mine, busy, load])

  return (
    <Shell>
      <div className="logpage pg-writing">
        <div className="crumb"><Link href="/">the log</Link></div>

        <div className="grid">
          <main>

        <div className="pghead"><h1>Writing</h1></div>
        <div className="stamp">
          <span>every made thing, one shape</span>
          {docs.length > 0 && <span>{docs.length}</span>}
        </div>

        <p className="none" style={{ paddingBottom: 12 }}>
          An essay, a report, a repository, a cut, a voice-over, a deck, a
          design, an export. A document is kept <b>whole and never split</b>
          {' '}— it shows on the log as one line saying you made it, and the
          text stays the text. Who made it is a field, and it is always
          filled in.
        </p>

        {!open ? (
          <div className="paste" style={{ marginBottom: 30 }}>
            <div className="bar">
              <button className="p" onClick={() => setOpen(true)}>Keep something you made</button>
              {msg && <span className="say">{msg}</span>}
            </div>
          </div>
        ) : (
          <div className="paste">
            <input
              className="ti"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What it is called"
            />
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="The text, whole. Nothing here is split, read or redrafted."
              rows={10}
            />
            <div className="who">
              {DOC_KINDS.map(k => (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                  {DOC_WORDS[k].name}
                </button>
              ))}
            </div>
            <div className="who">
              <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>you wrote it</button>
              <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>the log drafted it, you kept it</button>
              <em>This goes in the file when it is published, so it is never a question later.</em>
            </div>
            <div className="bar">
              <button className="p" onClick={() => void keep()} disabled={busy || !title.trim()}>
                {busy ? 'Keeping it' : 'Keep it'}
              </button>
              <button onClick={() => setOpen(false)}>Not now</button>
              {msg && <span className="say">{msg}</span>}
            </div>
          </div>
        )}

        {loading && <div className="none">Reading the log.</div>}
        {!loading && !docs.length && (
          <div className="none">Nothing made yet.</div>
        )}

        {docs.length > 0 && (
          <>
            {/* `writing.html`: "a document is a document · kind and
                who-made-it are fields." One table, four columns, whatever
                the thing is. */}
            <div className="sh"><span>Every made thing</span><b>one shape</b></div>
            <div className="spread">
              <div className="sp hd">
                <span>kind</span><span>the thing</span><span>who made it</span><span>body</span>
              </div>
              {docs.map(d => (
                <Link className="sp" key={d.id} href={`/writing/${d.id}`}>
                  <span className="k">{DOC_WORDS[asKind(d.kind)].name}</span>
                  <span className="n">
                    {d.title}
                    <i>
                      {d.word_count > 0 && `${d.word_count.toLocaleString('en-GB')} words`}
                      {d.draft_count > 1 && ` · ${d.draft_count} drafts, all kept`}
                      {d.page_name && ` · under ${d.page_name}`}
                    </i>
                  </span>
                  {/* ⚠️ Three variants, not two. `writing.css` colours `.w`
                      by who made it — `you` teal, `ai` violet, `log` grey —
                      and this collapsed `log` into `ai`, so a thing the LOG
                      made and a thing he made WITH a model looked identical.
                      `made_by` has four values for a reason: the entry's
                      author comes from it, so the log never signs his essay
                      and he never signs the log's report. */}
                  <span className={`w ${MADE_BY_CLASS[asMadeBy(d.made_by)]}`}>
                    {MADE_BY_WORDS[asMadeBy(d.made_by)]}
                  </span>
                  {/* `.b` is what the body points at — "the text", "the
                      README", "the file". This was `.c`, which is the
                      design's class for something else on this row. */}
                  <span className="b">
                    {DOC_WORDS[asKind(d.kind)].body}
                    <i>{d.visibility === 'public' ? 'public' : 'private'}</i>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* `writing.html`: "Three things that look alike and aren't." The
            distinction is the page — without it a finished essay and a
            letter the log drafted are the same row. */}
        <div className="cmp">
          <div>
            <b>This — something you wrote.</b> Whole. Never split. Yours from
            the first word, and publishable as-is the moment you say so. The
            log keeps the drafts and the dates; it never touches the text.
          </div>
          <div>
            <b>A recollection you dumped.</b> Also yours, also whole — but
            written <i>to be split</i> into dated entries. The document stays;
            the entries point back into it. Different intent, different page.
          </div>
          <div className="fence">
            <b>A letter the log drafted.</b> Assembled from your entries, in
            your voice. <i>Below the fence</i> — designed, not built, and
            never confused with the first two.
          </div>
        </div>

        <div className="rule">
          <b>You wrote it; the log kept it.</b> A document you made yourself
          is the one kind of made thing that crosses to public untouched — no
          reading, no reduction, no draft. The log&rsquo;s only mark on it is
          the date and the drafts.
        </div>
          </main>

          <Rail goesTo={[
            { href: '/', label: 'the log' },
            { href: '/export', label: 'export' },
          ]} />
        </div>
      </div>
    </Shell>
  )
}
