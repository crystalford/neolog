'use client'

/**
 * The one sentence about himself.
 *
 * `/facts` reads it and refuses to write one — a marked guess about a topic
 * can be checked against what he said, and a marked guess about a PERSON has
 * no such source. So it is typed here or it is absent, and the facts page
 * says which.
 */

import { useCallback, useEffect, useState } from 'react'

export function OperatorSentence() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/settings', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json() as { bio?: string | null }
        setValue(j.bio || '')
        setSaved(j.bio || '')
      } catch { /* the field just starts empty */ }
    })()
  }, [])

  const save = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/v2/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: value }),
      })
      if (res.ok) { setSaved(value); setMsg('Kept.') }
      else setMsg('that did not save')
    } catch { setMsg('that did not save') }
    finally { setBusy(false) }
  }, [value])

  return (
    <div className="paste">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={3}
        placeholder="One sentence, in your words. It goes on the facts page as yours."
      />
      <div className="bar">
        <button className="p" onClick={() => void save()} disabled={busy || value === saved}>
          {busy ? 'Keeping it' : 'Keep it'}
        </button>
        {msg && <span className="say">{msg}</span>}
        {!msg && !saved && (
          <span className="say">
            Without it the facts page says there isn&rsquo;t one. It will not write one for you.
          </span>
        )}
      </div>
    </div>
  )
}
