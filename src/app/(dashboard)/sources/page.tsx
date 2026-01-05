'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, RefreshCw, Trash2, Rss } from 'lucide-react'

type FeedSource = {
  id: string
  name: string | null
  url: string
  source_type: string
  publication_id?: string | null
  auto_convert_to_drafts?: boolean | null
  last_fetched_at: string | null
  created_at: string
}

type Publication = {
  id: string
  name: string
}

export default function SourcesPage() {
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<FeedSource[]>([])
  const [publications, setPublications] = useState<Publication[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [savingSettingsId, setSavingSettingsId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSources()
  }, [])

  const loadSources = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data: pubs } = await supabase
      .from('publications')
      .select('id, name')
      .eq('owner_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    setPublications((pubs || []) as Publication[])

    const { data } = await supabase
      .from('feed_sources')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    setSources((data || []) as FeedSource[])
    setLoading(false)
  }

  const updateSourceSettings = async (
    id: string,
    update: { publicationId?: string | null; autoConvertToDrafts?: boolean }
  ) => {
    setError(null)
    setSuccess(null)
    setSavingSettingsId(id)
    try {
      const response = await fetch('/api/sources/rss', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...update }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update source.')
      }
      setSources((prev) => prev.map((s) => (s.id === id ? (data.source as FeedSource) : s)))
      setSuccess('Source updated.')
    } catch (err: any) {
      setError(err.message || 'Failed to update source.')
    } finally {
      setSavingSettingsId(null)
    }
  }

  const addSource = async () => {
    setError(null)
    setSuccess(null)
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setError('Enter a valid RSS URL.')
      return
    }
    try {
      const parsed = new URL(trimmedUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('RSS URL must start with http or https.')
        return
      }
    } catch {
      setError('Enter a valid RSS URL.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/sources/rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || null, url: trimmedUrl }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add source.')
      }
      setName('')
      setUrl('')
      setSuccess('Source added.')
      await loadSources()
    } catch (err: any) {
      setError(err.message || 'Failed to add source.')
    } finally {
      setSaving(false)
    }
  }

  const removeSource = async (id: string) => {
    setError(null)
    setSuccess(null)
    const response = await fetch('/api/sources/rss', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) {
      const data = await response.json()
      setError(data.error || 'Failed to remove source.')
      return
    }
    setSources((prev) => prev.filter((item) => item.id !== id))
  }

  const fetchNow = async (id?: string) => {
    setError(null)
    setSuccess(null)
    if (id) {
      setFetchingId(id)
    } else {
      setFetchingAll(true)
    }
    const response = await fetch('/api/sources/rss/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: id || null }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error || 'Fetch failed.')
      setFetchingId(null)
      setFetchingAll(false)
      return
    }
    setSuccess(`Fetched ${data.inserted || 0} new item(s).`)
    await loadSources()
    setFetchingId(null)
    setFetchingAll(false)
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Sources</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">Pull content in</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Connect RSS feeds to populate your inbox automatically. Fetching runs in the background, or trigger it manually.
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          Auto-pull uses the RSS fetch endpoint (<span className="font-mono">/api/sources/rss/fetch</span>) when you wire a scheduled job.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-[var(--error)]/10 border border-[var(--error)]/20 p-4 text-sm text-[var(--error)]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl bg-[var(--success)]/10 border border-[var(--success)]/20 p-4 text-sm text-[var(--success)]">
          {success}
        </div>
      )}

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4 space-y-3">
        <h2 className="font-display text-lg text-[var(--text-primary)]">Add RSS feed</h2>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <input
            id="rss-name"
            name="rss-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Feed name (optional)"
            className="input"
          />
          <input
            id="rss-url"
            name="rss-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/rss.xml"
            className="input"
          />
          <button onClick={addSource} className="btn btn-primary btn-sm" disabled={saving}>
            <Plus size={14} />
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          Tip: add the full feed URL (often <span className="font-mono">/rss</span> or <span className="font-mono">/feed</span>).
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-light)]">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Connected feeds</p>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchNow()} className="btn btn-secondary btn-sm" disabled={fetchingAll}>
            <RefreshCw size={14} />
              {fetchingAll ? 'Fetching...' : 'Fetch all'}
            </button>
            <button onClick={() => router.push('/inbox')} className="btn btn-secondary btn-sm">
              View inbox
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-tertiary)]">Loading sources...</div>
        ) : sources.length === 0 ? (
          <div className="p-6 text-sm text-[var(--text-tertiary)]">No sources connected yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {sources.map((source) => (
              <div key={source.id} className="px-4 py-3 space-y-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {source.name || source.url}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">
                    {source.url}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Last fetched: {source.last_fetched_at ? new Date(source.last_fetched_at).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                      Destination publication
                    </label>
                    <select
                      className="input h-9"
                      value={source.publication_id || ''}
                      onChange={(event) => {
                        const next = event.target.value || null
                        void updateSourceSettings(source.id, { publicationId: next })
                      }}
                      disabled={savingSettingsId === source.id}
                    >
                      <option value="">(Use default)</option>
                      {publications.map((pub) => (
                        <option key={pub.id} value={pub.id}>
                          {pub.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      Used when auto-converting RSS items into drafts.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                      Auto-convert to drafts
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={savingSettingsId === source.id}
                        onClick={() => {
                          void updateSourceSettings(source.id, {
                            autoConvertToDrafts: !Boolean(source.auto_convert_to_drafts),
                          })
                        }}
                      >
                        {Boolean(source.auto_convert_to_drafts) ? 'On' : 'Off'}
                      </button>

                      <button
                        onClick={() => fetchNow(source.id)}
                        className="btn btn-secondary btn-sm"
                        disabled={fetchingId === source.id}
                      >
                        <Rss size={14} />
                        {fetchingId === source.id ? 'Fetching...' : 'Fetch'}
                      </button>

                      <button onClick={() => removeSource(source.id)} className="btn btn-secondary btn-sm text-[var(--error)]">
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      Requires the scheduled RSS pull to be running.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
