'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, RefreshCw } from 'lucide-react'

type LastEditingPost = {
  id: string
  title: string | null
}

const LAST_EDITING_POST_KEY = 'neolog:lastEditingPost'

const readLastEditingPost = (): LastEditingPost | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_EDITING_POST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.id !== 'string' || !parsed.id) return null
    return { id: parsed.id, title: typeof parsed.title === 'string' ? parsed.title : null }
  } catch {
    return null
  }
}

type Asset = {
  id: string
  user_id: string
  publication_id?: string | null
  type: 'prompt' | 'image' | 'code' | 'text' | 'link' | 'quote' | 'fragment'
  title?: string | null
  content: string
  source_platform?: string | null
  source_url?: string | null
  meta: any
  tags: string[]
  created_at: string
}

type Publication = {
  id: string
  name: string
  slug: string
}

const ASSET_TYPES: Asset['type'][] = ['text', 'fragment', 'quote', 'prompt', 'code', 'link', 'image']

export default function VaultPage() {
  const [loading, setLoading] = useState(true)
  const [assets, setAssets] = useState<Asset[]>([])
  const [semanticAssets, setSemanticAssets] = useState<Asset[] | null>(null)
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [publications, setPublications] = useState<Publication[]>([])

  const publicationNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of publications) {
      map.set(p.id, p.name)
    }
    return map
  }, [publications])

  const [currentDraft, setCurrentDraft] = useState<LastEditingPost | null>(null)
  const [attachingAssetId, setAttachingAssetId] = useState<string | null>(null)

  const [type, setType] = useState<Asset['type']>('text')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [meta, setMeta] = useState('')
  const [newAssetPublicationId, setNewAssetPublicationId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const [query, setQuery] = useState('')

  const [filterType, setFilterType] = useState<string>('')
  const [filterPublicationId, setFilterPublicationId] = useState<string>('')
  const [filterTags, setFilterTags] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const router = useRouter()
  const supabase = createClient()

  const isSemanticQuery = useMemo(() => query.trim().startsWith('~'), [query])
  const semanticQuery = useMemo(() => {
    if (!isSemanticQuery) return ''
    return query.trim().slice(1).trim()
  }, [isSemanticQuery, query])

  useEffect(() => {
    void loadAssets()
    void loadPublications()

    setCurrentDraft(readLastEditingPost())

    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_EDITING_POST_KEY) {
        setCurrentDraft(readLastEditingPost())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPublicationId])

  const loadPublications = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const { data, error } = await supabase
      .from('publications')
      .select('id,name,slug')
      .eq('owner_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) return
    setPublications((data || []) as Publication[])
  }

  useEffect(() => {
    if (!isSemanticQuery) {
      setSemanticAssets(null)
      setSemanticLoading(false)
      return
    }

    if (!semanticQuery) {
      setSemanticAssets([])
      setSemanticLoading(false)
      return
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        setError(null)
        setSuccess(null)
        setSemanticLoading(true)
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (!session) {
            router.push('/login')
            return
          }

          const params = new URLSearchParams({
            q: semanticQuery,
            limit: '50',
          })
          if (filterType.trim()) params.set('type', filterType.trim())
          if (filterPublicationId) params.set('publication_id', filterPublicationId)

          const resp = await fetch(`/api/assets/search?${params.toString()}`)
          const json = await resp.json().catch(() => null)
          if (!resp.ok) {
            setError(json?.error || 'Failed to search assets.')
            setSemanticAssets([])
            return
          }

          setSemanticAssets(((json?.results || []) as Asset[]) || [])
        } catch {
          setError('Failed to search assets.')
          setSemanticAssets([])
        } finally {
          setSemanticLoading(false)
        }
      })()
    }, 250)

    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSemanticQuery, semanticQuery, filterType, filterPublicationId])

  const attachToCurrentDraft = async (assetId: string) => {
    if (!currentDraft?.id) {
      setError('Open a draft in Write first (to pick the current draft).')
      return
    }
    if (attachingAssetId) return

    setError(null)
    setSuccess(null)
    setAttachingAssetId(assetId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const { error: insertError } = await supabase
        .from('post_assets')
        .insert({
          post_id: currentDraft.id,
          asset_id: assetId,
          added_by: session.user.id,
        })

      if (insertError) {
        const code = String((insertError as any)?.code || '')
        if (code !== '23505') {
          setError('Failed to attach asset to draft.')
          return
        }
      }

      setSuccess('Attached to current draft.')
    } finally {
      setAttachingAssetId(null)
    }
  }

  const loadAssets = async () => {
    setError(null)
    setSuccess(null)
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Use API route so filters/pagination can evolve without rewriting the UI.
    const params = new URLSearchParams({ limit: '200' })
    if (filterPublicationId) params.set('publication_id', filterPublicationId)

    const resp = await fetch(`/api/assets?${params.toString()}`)
    const json = await resp.json().catch(() => null)
    if (!resp.ok) {
      setError(json?.error || 'Failed to load assets.')
      setAssets([])
      setLoading(false)
      return
    }

    setAssets(((json?.assets || []) as Asset[]) || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = (isSemanticQuery ? '' : query).trim().toLowerCase()
    const selectedType = filterType.trim()
    const publicationFilter = filterPublicationId.trim()
    const source = filterSource.trim().toLowerCase()
    const requiredTags = filterTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)

    const fromMs = filterFrom ? new Date(filterFrom).getTime() : null
    const toMs = filterTo ? new Date(filterTo).getTime() : null

    const base = isSemanticQuery ? semanticAssets || [] : assets

    return base.filter((a) => {
      if (publicationFilter) {
        if (publicationFilter === 'none' || publicationFilter === 'null') {
          if (a.publication_id) return false
        } else {
          if (a.publication_id !== publicationFilter) return false
        }
      }

      if (selectedType && a.type !== selectedType) return false

      if (source) {
        const sp = (a.source_platform || '').toLowerCase()
        if (!sp.includes(source)) return false
      }

      if (requiredTags.length) {
        const tagSet = new Set((a.tags || []).map((t) => t.toLowerCase()))
        for (const rt of requiredTags) {
          if (!tagSet.has(rt)) return false
        }
      }

      if (fromMs !== null || toMs !== null) {
        const created = new Date(a.created_at).getTime()
        if (fromMs !== null && created < fromMs) return false
        if (toMs !== null && created > toMs) return false
      }

      if (!q) return true
      const haystack = [a.type, a.title || '', a.content, a.source_platform || '', a.source_url || '', ...(a.tags || [])]
        .join('\n')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [
    assets,
    semanticAssets,
    isSemanticQuery,
    query,
    filterType,
    filterPublicationId,
    filterTags,
    filterSource,
    filterFrom,
    filterTo,
  ])

  const addAsset = async () => {
    setError(null)
    setSuccess(null)

    const trimmedContent = content.trim()
    if (!trimmedContent) {
      setError('Content is required.')
      return
    }

    let parsedMeta: any = {}
    const metaText = meta.trim()
    if (metaText) {
      try {
        parsedMeta = JSON.parse(metaText)
      } catch {
        setError('Meta must be valid JSON (or left empty).')
        return
      }
    }

    const tagsList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50)

    setSaving(true)
    try {
      const resp = await fetch('/api/vault/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          content: trimmedContent,
          tags: tagsList,
          meta: parsedMeta,
          publication_id: newAssetPublicationId || null,
        }),
      })

      const json = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(json?.error || 'Failed to add to Vault.')
        setSaving(false)
        return
      }

      setContent('')
      setTags('')
      setMeta('')
      setNewAssetPublicationId('')
      setSuccess('Added to Vault.')
      await loadAssets()
    } catch {
      setError('Failed to add to Vault.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Vault</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">Vault</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Store prompts, snippets, links, and notes with provenance.
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Current draft</p>
        {currentDraft ? (
          <div className="mt-1 text-sm text-[var(--text-secondary)]">
            Attaching to: <span className="text-[var(--text-primary)]">{currentDraft.title || currentDraft.id}</span>
            <span className="text-[var(--text-tertiary)]"> · </span>
            <a href={`/write?edit=${currentDraft.id}`} className="underline text-[var(--text-secondary)]">
              Open
            </a>
          </div>
        ) : (
          <div className="mt-1 text-sm text-[var(--text-secondary)]">
            Open a draft in <a href="/write" className="underline">Write</a> to enable one-click attach.
          </div>
        )}
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
        <h2 className="font-display text-lg text-[var(--text-primary)]">Add to Vault</h2>

        <div className="grid gap-2 md:grid-cols-[160px_1fr]">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Asset['type'])}
            className="input"
            aria-label="Asset type"
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={newAssetPublicationId}
            onChange={(e) => setNewAssetPublicationId(e.target.value)}
            className="input"
            aria-label="Assign to publication"
          >
            <option value="">No publication (global)</option>
            {publications.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags (comma-separated)"
          className="input"
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Content"
          className="input min-h-[120px]"
        />

        <textarea
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          placeholder='meta JSON (optional) e.g. { "source": "web", "url": "https://..." }'
          className="input min-h-[90px] font-mono text-xs"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={addAsset}
            disabled={saving}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button
            onClick={() => void loadAssets()}
            disabled={saving}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <p className="text-xs text-[var(--text-tertiary)]">
          Tip: scripts can also POST to <span className="font-mono">/api/vault/add</span> with an automation API key.
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-[var(--text-primary)]">Recent</h2>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="input pl-9"
            />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-6">
          <select
            value={filterPublicationId}
            onChange={(e) => setFilterPublicationId(e.target.value)}
            className="input"
            aria-label="Filter by publication"
          >
            <option value="">All publications</option>
            <option value="none">Global (unassigned)</option>
            {publications.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input
            value={filterTags}
            onChange={(e) => setFilterTags(e.target.value)}
            placeholder="Tags (comma)"
            className="input"
          />

          <input
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            placeholder="Source"
            className="input"
          />

          <input
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            placeholder="From"
            className="input"
            type="date"
          />

          <input
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            placeholder="To"
            className="input"
            type="date"
          />
        </div>

        {loading || semanticLoading ? (
          <div className="text-sm text-[var(--text-secondary)]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)]">{isSemanticQuery ? 'No results.' : 'Nothing in your Vault yet.'}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{a.type}</div>
                    {a.publication_id ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-tertiary)] truncate">
                        {publicationNameById.get(a.publication_id) || 'Publication'}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]">{new Date(a.created_at).toLocaleDateString()}</div>
                </div>

                <a href={`/vault/${a.id}`} className="block">
                  {a.type === 'image' && /^https?:\/\//i.test(a.content) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.content}
                      alt={a.title || 'Image asset'}
                      className="w-full h-40 object-cover rounded-xl border border-[var(--border-light)]"
                    />
                  ) : null}

                  {a.title ? (
                    <div className="text-sm font-medium text-[var(--text-primary)] break-words">
                      {a.title}
                    </div>
                  ) : null}

                  <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                    {a.content.length > 220 ? `${a.content.slice(0, 220)}…` : a.content}
                  </div>
                </a>

                {a.source_platform || a.source_url ? (
                  <div className="text-xs text-[var(--text-tertiary)] flex flex-wrap items-center gap-2 pt-1">
                    {a.source_platform ? <span>{a.source_platform}</span> : null}
                    {a.source_url ? (
                      <a href={a.source_url} target="_blank" rel="noreferrer" className="underline">
                        source
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {a.tags?.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {a.tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}

                {currentDraft ? (
                  <div className="pt-2 flex items-center justify-end">
                    <button
                      onClick={() => void attachToCurrentDraft(a.id)}
                      disabled={attachingAssetId === a.id}
                      className="btn btn-secondary btn-sm"
                    >
                      {attachingAssetId === a.id ? 'Attaching…' : 'Attach to current draft'}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
