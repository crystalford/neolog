'use client'

/**
 * AutoPublishSettings — webhook URL + defaults for the auto-publish
 * pipeline.
 *
 * One input (webhook URL), one switch (default new uploads to
 * auto-publish), one number (max clips per vlog), one button (test
 * ping). All persist via PUT /api/v2/operator/social-fanout.
 *
 * Lives inside the existing Settings page Section frame, so styling
 * inherits the canon row vocabulary used by the rest of the page.
 */

import { useCallback, useEffect, useState } from 'react'

interface SocialFanoutSettings {
  webhook_url: string | null
  auto_publish_default: number
  auto_publish_max_per_vlog: number
}

export function AutoPublishSettings() {
  const [loaded, setLoaded] = useState(false)
  const [url, setUrl] = useState('')
  const [defaultOn, setDefaultOn] = useState(false)
  const [maxPerVlog, setMaxPerVlog] = useState(2)
  const [saving, setSaving] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/operator/social-fanout', { credentials: 'include' })
      const d: SocialFanoutSettings = await r.json()
      setUrl(d.webhook_url ?? '')
      setDefaultOn(d.auto_publish_default === 1)
      setMaxPerVlog(d.auto_publish_max_per_vlog ?? 2)
      setLoaded(true)
    } catch (err: any) {
      setNote(`Couldn't load: ${err?.message || err}`)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (ping: boolean) => {
    if (ping) setPinging(true); else setSaving(true)
    setNote(null)
    try {
      const r = await fetch('/api/v2/operator/social-fanout', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: url.trim() || null,
          auto_publish_default: defaultOn,
          auto_publish_max_per_vlog: maxPerVlog,
          ping,
        }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      if (ping) {
        if (d.ping?.ok) setNote(`Ping ok (status ${d.ping.status}). Your fanout vendor received the payload.`)
        else if (d.ping) setNote(`Ping failed: ${d.ping.message || `status ${d.ping.status}`}`)
        else setNote('Saved, but no URL was set — nothing to ping.')
      } else {
        setNote('Saved.')
      }
    } catch (err: any) {
      setNote(err?.message || String(err))
    } finally {
      setSaving(false); setPinging(false)
    }
  }

  if (!loaded) {
    return (
      <div style={{
        padding: '14px 18px', background: 'var(--bg-1)',
        color: 'var(--fg-3)', fontSize: 13,
      }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{
      padding: '14px 18px', background: 'var(--bg-1)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.6,
          textTransform: 'uppercase', color: 'var(--fg-3)',
        }}>
          Webhook URL
        </span>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://hook.eu2.make.com/abc123…"
          style={{
            fontSize: 13.5, padding: '8px 12px',
            background: 'var(--bg-2)', color: 'var(--fg)',
            border: '1px solid var(--line-2)', borderRadius: 6,
            fontFamily: 'var(--font-mono)',
          }}
        />
      </label>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
        color: 'var(--fg-1)', cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={defaultOn}
          onChange={e => setDefaultOn(e.target.checked)}
        />
        <span>Auto-publish new uploads by default</span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--fg-1)' }}>
        <span>Max clips per vlog:</span>
        <input
          type="number"
          min={1}
          max={10}
          value={maxPerVlog}
          onChange={e => setMaxPerVlog(Math.max(1, Math.min(10, Number(e.target.value) || 2)))}
          style={{
            width: 60, fontSize: 13, padding: '4px 8px',
            background: 'var(--bg-2)', color: 'var(--fg)',
            border: '1px solid var(--line-2)', borderRadius: 4,
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={() => save(false)}
          disabled={saving || pinging}
          className="canon-btn primary"
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || pinging || !url.trim()}
          className="canon-btn ghost"
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          {pinging ? 'Pinging…' : 'Save & test ping'}
        </button>
        {note && (
          <span style={{ fontSize: 12, color: 'var(--fg-2)', marginLeft: 6, alignSelf: 'center' }}>
            {note}
          </span>
        )}
      </div>

      <div style={{
        fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5, marginTop: 6,
      }}>
        Payload shape: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {`{ clip_id, production_id, post_id, vlog_id, mp4_url, mp4_expires_in_sec, caption, duration_sec, headline, source_recorded_at }`}
        </code>
      </div>
    </div>
  )
}
