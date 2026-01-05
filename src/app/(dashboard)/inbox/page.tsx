"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, X, FilePlus2 } from 'lucide-react'
import { onSelectedPublicationIdChange, readSelectedPublicationId, writeSelectedPublicationId } from '@/lib/publicationContext'

type InboxItem = {
  id: string
  title: string | null
  canonical_url: string | null
  source_type: string
  source_url: string | null
  status: 'new' | 'imported' | 'ignored'
  raw_data: any
  created_at: string
}

export default function InboxPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<InboxItem[]>([])
  const [publicationId, setPublicationId] = useState<string | null>(null)
  const [publications, setPublications] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [bulkConverting, setBulkConverting] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [statusFilter, setStatusFilter] = useState<'all' | InboxItem['status']>('new')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<'all' | '7' | '30'>('30')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const unsubscribe = onSelectedPublicationIdChange((publicationId) => {
      if (publicationId) setPublicationId(publicationId)
    })
    return unsubscribe
  }, [])

  const loadData = async () => {
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

    setPublications(pubs || [])

    const selectedId = readSelectedPublicationId()

    const defaultId = selectedId || pubs?.[0]?.id || null
    setPublicationId(defaultId)
    if (defaultId) writeSelectedPublicationId(defaultId)

    const { data: inboxItems } = await supabase
      .from('inbox_items')
      .select('*')
      .order('created_at', { ascending: false })

    setItems((inboxItems || []) as InboxItem[])
    setLoading(false)
  }

  const updateStatus = async (id: string, status: InboxItem['status']) => {
    await supabase
      .from('inbox_items')
      .update({ status })
      .eq('id', id)

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    )
  }

  const createDraftFromInboxItem = async (item: InboxItem): Promise<{ postId: string } | null> => {
    if (!publicationId) {
      setError('Choose a publication first.')
      return null
    }

    const title = item.title || item.raw_data?.title || 'Imported draft'
    const contentHtml =
      item.raw_data?.content_html ||
      item.raw_data?.content ||
      item.raw_data?.description ||
      ''

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)

    const canonical = String(item.canonical_url || '')
    const hash = canonical
      ? canonical
          .split('')
          .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
          .toString(16)
          .slice(0, 6)
      : item.id.slice(0, 6)

    const fallbackBase = baseSlug || `import-${item.id.slice(0, 8)}`
    const slugCandidates = [
      fallbackBase,
      `${fallbackBase.slice(0, 72)}-${hash}`,
      `${fallbackBase.slice(0, 68)}-${hash}-${Date.now().toString(36).slice(-4)}`,
    ]

    for (const slug of slugCandidates) {
      const attempt = await supabase
        .from('posts')
        .insert({
          author_id: session.user.id,
          publication_id: publicationId,
          title,
          slug,
          content: contentHtml,
          content_html: contentHtml,
          content_type: 'html',
          status: 'draft',
          canonical_url: item.canonical_url,
          original_source: item.source_type,
        })
        .select('id')
        .maybeSingle()

      if (attempt.data?.id && !attempt.error) {
        return { postId: attempt.data.id as string }
      }

      const code = String((attempt.error as any)?.code || '')
      if (code !== '23505') {
        break
      }
    }

    setError('Failed to convert to draft.')
    return null
  }

  const convertToDraft = async (item: InboxItem) => {
    setError(null)
    setConvertingId(item.id)

    const created = await createDraftFromInboxItem(item)
    if (!created) {
      setConvertingId(null)
      return
    }

    await updateStatus(item.id, 'imported')
    setSelected((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
    setConvertingId(null)
    router.push(`/write?edit=${created.postId}`)
  }

  const toggleSelected = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = { ...prev }
      filteredItems.forEach((item) => {
        if (item.status === 'new') next[item.id] = true
      })
      return next
    })
  }

  const clearSelection = () => setSelected({})

  const selectedCount = Object.values(selected).filter(Boolean).length

  const bulkConvertSelected = async () => {
    if (bulkConverting) return
    setError(null)

    if (!publicationId) {
      setError('Choose a publication first.')
      return
    }

    const selectedItems = filteredItems.filter((item) => selected[item.id])
    const toConvert = selectedItems.filter((item) => item.status === 'new')
    if (toConvert.length === 0) return

    setBulkConverting(true)

    try {
      const resp = await fetch('/api/inbox/bulk-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicationId,
          inboxItemIds: toConvert.map((i) => i.id),
        }),
      })

      const json = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(json?.error || 'Failed to convert selected items.')
        setBulkConverting(false)
        return
      }

      const results: Array<{ inboxItemId: string; status: 'converted' | 'skipped' | 'failed' }> =
        Array.isArray(json?.results) ? json.results : []

      const convertedIds = results
        .filter((r) => r.status === 'converted')
        .map((r) => r.inboxItemId)

      if (convertedIds.length > 0) {
        setItems((prev) =>
          prev.map((item) =>
            convertedIds.includes(item.id) ? { ...item, status: 'imported' } : item,
          ),
        )
      }

      setSelected((prev) => {
        const next = { ...prev }
        for (const id of convertedIds) delete next[id]
        return next
      })

      const failedCount = results.filter((r) => r.status === 'failed').length
      if (failedCount > 0) {
        setError('Some items failed to convert.')
      }
    } catch {
      setError('Failed to convert selected items.')
    }

    setBulkConverting(false)
  }

  const sourceOptions = Array.from(new Set(items.map((item) => item.source_type))).sort()
  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (sourceFilter !== 'all' && item.source_type !== sourceFilter) return false
    if (dateFilter !== 'all') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - Number(dateFilter))
      if (new Date(item.created_at) < cutoff) return false
    }
    return true
  })

  const getStatusPill = (status: InboxItem['status']) => {
    if (status === 'imported') return 'bg-[var(--success)]/10 text-[var(--success)]'
    if (status === 'ignored') return 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
    return 'bg-[var(--accent-soft)] text-[var(--accent)]'
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Inbox</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">Incoming drafts</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Review new items before converting them into drafts.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-[var(--error)]/10 border border-[var(--error)]/20 p-4 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4">
        <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
          Default publication
        </label>
        <select
          id="inbox-publication"
          name="inbox-publication"
          value={publicationId || ''}
          onChange={(event) => {
            const next = event.target.value
            setPublicationId(next)
            writeSelectedPublicationId(next)
          }}
          className="input max-w-md"
        >
          {publications.map((pub) => (
            <option key={pub.id} value={pub.id}>
              {pub.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          Pull new items by adding RSS feeds in <span className="font-medium text-[var(--text-secondary)]">Sources</span>.
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-[var(--border-light)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
              Inbox ({filteredItems.length})
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={selectAllFiltered}
                className="btn btn-secondary btn-sm"
                disabled={filteredItems.filter((i) => i.status === 'new').length === 0}
              >
                Select all
              </button>
              <button
                onClick={bulkConvertSelected}
                className="btn btn-primary btn-sm"
                disabled={selectedCount === 0 || bulkConverting}
              >
                <FilePlus2 size={14} />
                {bulkConverting ? 'Converting...' : `Convert selected (${selectedCount})`}
              </button>
              {selectedCount > 0 && (
                <button onClick={clearSelection} className="btn btn-secondary btn-sm" disabled={bulkConverting}>
                  Clear
                </button>
              )}
              <select
                id="inbox-status"
                name="inbox-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="input h-8 text-xs"
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="imported">Imported</option>
                <option value="ignored">Ignored</option>
              </select>
              <select
                id="inbox-source"
                name="inbox-source"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="input h-8 text-xs"
              >
                <option value="all">All sources</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source.toUpperCase()}
                  </option>
                ))}
              </select>
              <select
                id="inbox-date"
                name="inbox-date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}
                className="input h-8 text-xs"
              >
                <option value="all">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-[var(--text-tertiary)]">Loading inbox...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-6 text-sm text-[var(--text-tertiary)]">
            No items match those filters.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {filteredItems.map((item) => (
              <div key={item.id} className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(selected[item.id])}
                      onChange={() => toggleSelected(item.id)}
                      disabled={bulkConverting || item.status !== 'new'}
                    />
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {item.title || item.raw_data?.title || 'Untitled'}
                  </p>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {item.source_type.toUpperCase()} - {item.canonical_url || item.source_url || 'Unknown source'}
                  </p>
                  {item.raw_data?.published_at && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Published {new Date(item.raw_data.published_at).toLocaleDateString()}
                    </p>
                  )}
                  <div className="mt-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.2em] ${getStatusPill(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => convertToDraft(item)}
                    className="btn btn-primary btn-sm"
                    disabled={bulkConverting || convertingId === item.id || item.status !== 'new'}
                  >
                    <FilePlus2 size={14} />
                    {convertingId === item.id ? 'Converting...' : 'Convert'}
                  </button>
                  {(item.canonical_url || item.source_url) && (
                    <a
                      href={item.canonical_url || item.source_url || ''}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      View source
                    </a>
                  )}
                  {item.status !== 'ignored' ? (
                    <button onClick={() => updateStatus(item.id, 'ignored')} className="btn btn-secondary btn-sm">
                      <X size={14} />
                      Ignore
                    </button>
                  ) : (
                    <button onClick={() => updateStatus(item.id, 'new')} className="btn btn-secondary btn-sm">
                      <Check size={14} />
                      Restore
                    </button>
                  )}
                  {item.status === 'new' && (
                    <button onClick={() => updateStatus(item.id, 'imported')} className="btn btn-secondary btn-sm">
                      <Check size={14} />
                      Mark done
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
