'use client'

/**
 * One thread — both sides, and what a stranger would see today.
 *
 * The second half is the point of the page. `messages.html` shows the
 * default state's public rendering and says: "Your words, his absences. The
 * shape of a conversation with none of his content. It reads a little
 * strange — **that's correct.** The strangeness is his privacy, made visible
 * instead of quietly overridden."
 *
 * So the preview is not a nicety. It is the only way he can see what his
 * publishing would actually do to someone else before he does it, and it is
 * rendered from the same function the public surfaces use — never from a
 * second copy of the rule that could drift from it.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Shell from '@/components/Shell'
import {
  CONSENT_STATES, CONSENT_WORDS, asConsent, type Consent,
} from '@/lib/correspondence'

interface Msg {
  id: string; side: 'operator' | 'other'; speaker: string | null
  text: string; sent_at: string | null; sent_at_source: string
  position: number; entry_id: string | null
}
interface PubMsg {
  id: string; side: 'operator' | 'other'; speaker: string | null
  text: string | null; sent_at: string | null; withheld: string | null
}
interface Result {
  thread: {
    id: string; person_name: string; person_page_id: string | null
    medium: string; started_at: string | null; ended_at: string | null
    message_count: number
  }
  messages: Msg[]
  consent: string
  consent_at: string | null
  consent_note: string | null
  public_view: PubMsg[]
}

const clock = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function Thread() {
  const params = useParams<{ id: string }>()
  const [r, setR] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/log/correspondence/${params.id}`, { cache: 'no-store' })
      if (res.ok) setR(await res.json() as Result)
    } catch { setR(null) }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  const setConsent = useCallback(async (state: Consent) => {
    setErr(null)
    try {
      const res = await fetch(`/api/v2/log/correspondence/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: state, consent_note: note }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        setErr(j.error || 'that did not save')
        return
      }
      setNote('')
      await load()
    } catch { setErr('that did not save') }
  }, [params.id, note, load])

  const consent = asConsent(r?.consent)
  const t = r?.thread

  return (
    <Shell>
      <div className="logpage">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/messages">messages</Link>
        </div>

        {loading && <div className="none">Reading it.</div>}
        {!loading && !t && <div className="none">No such conversation.</div>}

        {t && r && (
          <>
            <div className="pghead">
              <h1>
                {t.medium === 'email' ? 'Emails' : t.medium === 'chat' ? 'Messages' : 'Texts'} with {t.person_name}
              </h1>
            </div>
            <div className="stamp">
              {t.started_at && <time dateTime={t.started_at}>{clock(t.started_at)}</time>}
              <span>{t.message_count} messages</span>
              {t.person_page_id
                ? <Link href={`/page/${t.person_page_id}`}>their page</Link>
                : <span>not attached to a page</span>}
            </div>

            {/* Both sides, whole, as he forwarded them. This half is his to
                read and is not affected by the consent state — the state
                governs what a STRANGER sees, not what he keeps. */}
            <div className="lsec"><span>the thread</span><b>only you see this</b></div>
            <div className="msgs">
              {r.messages.map(m => (
                <div className={`msg ${m.side}`} key={m.id}>
                  <div className="who">
                    {m.speaker || (m.side === 'operator' ? 'you' : t.person_name)}
                    {m.sent_at && (
                      <time dateTime={m.sent_at}>
                        {clock(m.sent_at)}
                        {m.sent_at_source !== 'paste' && ' · no time given'}
                      </time>
                    )}
                  </div>
                  <div className="body">{m.text}</div>
                  {m.entry_id && (
                    <div className="note"><Link href={`/entry/${m.entry_id}`}>on the log</Link></div>
                  )}
                  {m.side === 'other' && (
                    <div className="note">theirs — filed as {t.person_name} says, not as fact</div>
                  )}
                </div>
              ))}
            </div>

            {/* Their answer. Four states, and the default is the most
                private one — set without asking, because the person whose
                words these are is not here to ask. */}
            <div className="lsec">
              <span>their answer</span>
              <b>{r.consent_at ? `set ${clock(r.consent_at)}` : 'never asked'}</b>
            </div>
            <div className="consent">
              {CONSENT_STATES.map(s => (
                <button
                  key={s}
                  className={consent === s ? 'on' : ''}
                  onClick={() => void setConsent(s)}
                >
                  <b>{CONSENT_WORDS[s].name}</b>
                  <span>{CONSENT_WORDS[s].what}</span>
                  {s === 'kept_private' && <em>the default — everyone starts here</em>}
                </button>
              ))}
              <div className="how">
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="How did they say it? Said so on the phone, 4 Sep."
                />
                <em>
                  Their yes is a fact on the log, not a checkbox: when they
                  said it and how, kept with the state.
                  {r.consent_note && ` Currently: ${r.consent_note}`}
                </em>
              </div>
              {err && <div className="err">{err}</div>}
            </div>

            {/* The whole reason this page exists. */}
            <div className="lsec">
              <span>what a stranger sees if you publish this today</span>
            </div>
            {r.public_view.length === 0 ? (
              <div className="none">
                Nothing. They asked to be removed, and your side alone would
                read as though you said all of it.
              </div>
            ) : (
              <div className="msgs pub">
                {r.public_view.map(m => (
                  <div className={`msg ${m.side}${m.text === null ? ' gone' : ''}`} key={m.id}>
                    {m.text === null ? (
                      <div className="body">{m.withheld}</div>
                    ) : (
                      <>
                        <div className="who">{m.speaker || 'you'}</div>
                        <div className="body">{m.text}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {consent !== 'quotable' && r.public_view.length > 0 && (
              <p className="none">
                Your words, their absences. It reads strangely, and that is
                correct — the strangeness is their privacy, visible instead of
                quietly overridden.
              </p>
            )}
          </>
        )}
      </div>
    </Shell>
  )
}
