'use client'

/**
 * Messages — correspondence, and the way one gets onto the log.
 *
 * `messages.html`: "Forwarded by you, always. The log never reads your
 * inbox... Correspondence is chosen, one thread at a time, because every
 * thread has someone else in it."
 *
 * So the top of this page is a paste box and nothing else. There is no
 * connect-your-email button here, and its absence is the feature — the
 * email door in this product is for him writing TO the log, never for the
 * log reading what others wrote to him.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import { CONSENT_WORDS, asConsent } from '@/lib/correspondence'

interface Thread {
  id: string; person_name: string; person_page_id: string | null
  medium: string; started_at: string | null; ended_at: string | null
  message_count: number; created_at: string; consent: string | null
}

const day = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Messages() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [mine, setMine] = useState('')
  const [speakers, setSpeakers] = useState<string[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/log/correspondence', { cache: 'no-store' })
      if (res.ok) setThreads(((await res.json()) as { threads: Thread[] }).threads || [])
    } catch { /* the list just doesn't show */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const bringIn = useCallback(async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/v2/log/correspondence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mine: mine || undefined }),
      })
      const j = await res.json() as {
        error?: string; speakers?: string[]; needs?: string
        messages?: number; entries_written?: number; person_name?: string
      }
      if (res.status === 409 && j.needs === 'mine') {
        // Nothing was written. Which side is his is not something the log
        // will guess — getting it wrong files their sentences as his.
        setSpeakers(j.speakers || [])
        setMsg('Which one of these is you?')
      } else if (!res.ok) {
        setMsg(j.error || 'that did not read as a conversation')
      } else {
        // One line saying what happened. Nothing is asked at this moment.
        setMsg(
          `Kept ${j.messages} messages with ${j.person_name}. ` +
          `${j.entries_written} of your own are on the log. ` +
          `Theirs are kept and are not public.`,
        )
        setText('')
        setMine('')
        setSpeakers(null)
        await load()
      }
    } catch {
      setMsg('that did not go in')
    } finally { setBusy(false) }
  }, [text, mine, busy, load])

  return (
    <Shell>
      <div className="logpage pg-messages">
        <div className="back"><Link href="/">the log</Link></div>

        <div className="grid">
          <main>

        <div className="pghead"><h1>Messages</h1></div>
        <div className="stamp">
          <span>the one kind with someone else in it</span>
          <span>forwarded by you, never pulled from an inbox</span>
        </div>

        <p className="none" style={{ paddingBottom: 12 }}>
          Paste a thread. Your side goes on the log as entries, the way
          anything you write does. Their side is kept, attached to them, and
          does not become public on your word alone.
        </p>

        <div className="paste">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'You  27 Aug 22:14\nGot the job. Ancaster. Start Monday.\n\nLeif  22:19\nHa. Eighteen years.'}
            rows={8}
          />
          {speakers && speakers.length > 0 && (
            <div className="who">
              {speakers.map(s => (
                <button
                  key={s}
                  className={mine === s ? 'on' : ''}
                  onClick={() => setMine(s)}
                >{s}</button>
              ))}
              <em>Nothing was written. Say which name is yours and press again.</em>
            </div>
          )}
          <div className="bar">
            <button className="p" onClick={() => void bringIn()} disabled={busy || !text.trim()}>
              {busy ? 'Keeping it' : 'Bring it in'}
            </button>
            {msg && <span className="say">{msg}</span>}
          </div>
        </div>

        {loading && <div className="none">Reading the log.</div>}

        {!loading && !threads.length && (
          <div className="none">
            No conversations here yet.
          </div>
        )}

        {threads.map(t => {
          const c = asConsent(t.consent)
          return (
            <div className="item" key={t.id}>
              <div className="x">
                <Link href={`/messages/${t.id}`}>
                  {t.medium === 'email' ? 'Emails' : t.medium === 'chat' ? 'Messages' : 'Texts'} with {t.person_name}
                </Link>
              </div>
              <div className="m">
                {t.started_at && <time dateTime={t.started_at}>{day(t.started_at)}</time>}
                <span>{t.message_count} {t.message_count === 1 ? 'message' : 'messages'}</span>
                <span>{CONSENT_WORDS[c].name.toLowerCase()}</span>
                {t.person_page_id
                  ? <Link href={`/page/${t.person_page_id}`}>their page</Link>
                  : <span>not attached to a page</span>}
              </div>
            </div>
          )
        })}
                </main>

          <Rail goesTo={[{ href: '/pages', label: 'the index' }, { href: '/ways-in', label: 'the ways in' }]} />
        </div>
      </div>
    </Shell>
  )
}
