'use client'

/**
 * Where else to find him.
 *
 * `dossier.html`: "so a machine knows these are all one person." `/facts`
 * emits these as `sameAs` in its Person block, which is the one field that
 * turns a page about a person into a claim a machine can check against
 * somewhere else.
 *
 * ⚠️ Every one of these is typed. Nothing is looked up, there is no
 * connector, and there will not be one — the same rule correspondence
 * follows, for the same reason: a url the log guessed would attach a
 * stranger's account to his name in a format built to be trusted.
 */

import { useCallback, useEffect, useState } from 'react'

interface Link { kind: string; url: string }

export function SameAs() {
  const [links, setLinks] = useState<Link[]>([])
  const [kind, setKind] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/settings', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json() as { same_as?: string | null }
        if (!j.same_as) return
        const v = JSON.parse(j.same_as)
        if (Array.isArray(v)) setLinks(v)
      } catch { /* the list just starts empty */ }
    })()
  }, [])

  const put = useCallback(async (next: Link[]) => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/v2/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ same_as: next }),
      })
      if (res.ok) {
        const j = await res.json() as { same_as?: Link[] }
        setLinks(j.same_as || next)
        setMsg('Kept.')
      } else setMsg('that did not save')
    } catch { setMsg('that did not save') }
    finally { setBusy(false) }
  }, [])

  const add = () => {
    const u = url.trim()
    if (!/^https?:\/\//.test(u)) { setMsg('a full address, starting http'); return }
    setKind(''); setUrl('')
    void put([...links, { kind: kind.trim() || 'elsewhere', url: u }])
  }

  return (
    <div className="paste">
      {links.length > 0 && (
        <div className="who">
          {links.map(l => (
            <button key={l.url} onClick={() => void put(links.filter(x => x.url !== l.url))}>
              {l.kind} · {l.url.replace(/^https?:\/\/(www\.)?/, '')} ×
            </button>
          ))}
          <em>Press one to take it off. Nothing is checked or fetched.</em>
        </div>
      )}
      <div className="bar">
        <input
          value={kind}
          onChange={e => setKind(e.target.value)}
          placeholder="what it is — github, the company"
          style={{ maxWidth: 220 }}
        />
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://…"
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button className="p" onClick={add} disabled={busy || !url.trim()}>
          {busy ? 'Keeping it' : 'Add it'}
        </button>
        {msg && <span className="say">{msg}</span>}
      </div>
    </div>
  )
}
