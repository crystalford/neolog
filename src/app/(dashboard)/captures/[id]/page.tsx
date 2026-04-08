'use client'
export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'

type AssetType = 'prompt' | 'image' | 'code' | 'text' | 'link' | 'quote' | 'fragment'

type Asset = {
  id: string
  type: AssetType
  title: string | null
  content: string
  tags: string[]
  publication_id?: string | null
  source_platform: string | null
  source_url: string | null
  meta: any
  created_at: string
  updated_at: string
}

type Publication = {
  id: string
  name: string
  slug: string
}

type UsedInRow = {
  post: {
    id: string
    title: string
    slug: string
    status: string
    published_at: string | null
    created_at: string
  }
  linked_at: string
}

const ASSET_TYPES: AssetType[] = ['text', 'fragment', 'quote', 'prompt', 'code', 'link', 'image']

export default function CaptureAssetDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [asset, setAsset] = useState<Asset | null>(null)
  const [usedIn, setUsedIn] = useState<UsedInRow[]>([])

  const [publications, setPublications] = useState<Publication[]>([])

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [type, setType] = useState<AssetType>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [publicationId, setPublicationId] = useState<string>('')
  const [sourcePlatform, setSourcePlatform] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [metaText, setMetaText] = useState('')

  const id = params?.id

  useEffect(() => {
    if (!id) return
    void loadPublications()
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadPublications = async () => {
    const resp = await fetch('/api/publications')
    const json = await resp.json().catch(() => null)

    if (!resp.ok) {
      // Publications are optional; keep the page usable even if unavailable.
      setPublications([])
      return
    }

    const pubs = (json?.publications || []) as Publication[]
    setPublications(pubs)
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const resp = await fetch(`/api/assets/${encodeURIComponent(id)}?includeUsedIn=1`)
    const json = await resp.json().catch(() => null)

    if (!resp.ok) {
      if (resp.status === 401) {
        router.push('/login')
        return
      }
      setError(json?.error || 'Failed to load asset.')
      setLoading(false)
      return
    }

    const loaded = json?.asset as Asset | undefined
    if (!loaded) {
      setError('Asset not found.')
      setLoading(false)
      return
    }

    setAsset(loaded)
    setUsedIn((json?.usedIn || []) as UsedInRow[])

    setType(loaded.type)
    setTitle(loaded.title || '')
    setContent(loaded.content || '')
    setTags((loaded.tags || []).join(', '))
    setPublicationId(loaded.publication_id ? String(loaded.publication_id) : '')
    setSourcePlatform(loaded.source_platform || '')
    setSourceUrl(loaded.source_url || '')
    setMetaText(JSON.stringify(loaded.meta || {}, null, 2))

    setLoading(false)
  }

  const previewMetaError = useMemo(() => {
    const trimmed = metaText.trim()
    if (!trimmed) return null
    try {
      JSON.parse(trimmed)
      return null
    } catch {
      return 'Meta must be valid JSON.'
    }
  }, [metaText])

  const save = async () => {
    if (!asset) return
    setError(null)
    setSuccess(null)

    const trimmedContent = content.trim()
    if (!trimmedContent) {
      setError('Content is required.')
      return
    }

    let parsedMeta: any = {}
    if (metaText.trim()) {
      try {
        parsedMeta = JSON.parse(metaText)
      } catch {
        setError('Meta must be valid JSON.')
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
      const resp = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim() || null,
          content: trimmedContent,
          tags: tagsList,
          publication_id: publicationId || null,
          source_platform: sourcePlatform.trim() || null,
          source_url: sourceUrl.trim() || null,
          meta: parsedMeta,
        }),
      })

      const json = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(json?.error || 'Failed to save changes.')
        return
      }

      setSuccess('Saved.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const deleteAsset = async () => {
    if (!asset) return
    if (deleting) return

    setError(null)
    setSuccess(null)
    setDeleting(true)
    try {
      const resp = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: 'DELETE',
      })

      const json = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(json?.error || 'Failed to delete asset.')
        return
      }

      router.push('/dashboard/captures')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto">
        <div className="text-sm text-[var(--text-secondary)]">Loading...</div>
      </main>
    )
  }

  if (!asset) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-4">
        <button onClick={() => router.push('/dashboard/captures')} className="btn btn-ghost inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="text-sm text-[var(--text-secondary)]">Capture not found.</div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Captures</p>
          <h1 className="font-display text-3xl text-[var(--text-primary)]">Capture</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Edit metadata and track usage.</p>
        </div>
        <button onClick={() => router.push('/dashboard/captures')} className="btn btn-ghost inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
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
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            {asset.type}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">{new Date(asset.created_at).toLocaleString()}</div>
        </div>

        <div className="grid gap-2 md:grid-cols-[160px_1fr]">
          <select value={type} onChange={(e) => setType(e.target.value as AssetType)} className="input" aria-label="Asset type">
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="input" />
        </div>

        <select
          value={publicationId}
          onChange={(e) => setPublicationId(e.target.value)}
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

        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={sourcePlatform}
            onChange={(e) => setSourcePlatform(e.target.value)}
            placeholder="Source platform (optional)"
            className="input"
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Source URL (optional)"
            className="input"
          />
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
          className="input min-h-[160px]"
        />

        <textarea
          value={metaText}
          onChange={(e) => setMetaText(e.target.value)}
          placeholder='meta JSON (optional) e.g. { "source": "web", "url": "https://..." }'
          className="input min-h-[120px] font-mono text-xs"
        />
        {previewMetaError ? (
          <div className="text-xs text-[var(--error)]">{previewMetaError}</div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <button onClick={save} disabled={saving || Boolean(previewMetaError)} className="btn btn-primary inline-flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button
            onClick={deleteAsset}
            disabled={deleting}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4 space-y-3">
        <h2 className="font-display text-lg text-[var(--text-primary)]">Used in</h2>
        {usedIn.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)]">Not used in any posts yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {usedIn.map((row) => (
              <div key={row.post.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-[var(--text-primary)]">{row.post.title}</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{row.post.status}</div>
                </div>
                <a className="btn btn-ghost btn-sm" href={`/write?edit=${row.post.id}`}>
                  Open
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
