'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { TagSelect } from '@/components/TagSelect'

type AssetType = 'text' | 'fragment' | 'quote' | 'prompt' | 'code' | 'link' | 'image'

type Publication = {
  id: string
  name: string
  slug: string
}

type QuickCaptureModalProps = {
  isOpen: boolean
  onClose: () => void
  initialPublicationId?: string | null
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'fragment', label: 'Text fragment' },
  { value: 'text', label: 'Text' },
  { value: 'quote', label: 'Quote' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'code', label: 'Code' },
  { value: 'link', label: 'Link' },
  { value: 'image', label: 'Image' },
]

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

export function QuickCaptureModal({ isOpen, onClose, initialPublicationId }: QuickCaptureModalProps) {
  const router = useRouter()

  const [publications, setPublications] = useState<Publication[]>([])
  const [loadingPubs, setLoadingPubs] = useState(false)

  const [type, setType] = useState<AssetType>('fragment')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [publicationId, setPublicationId] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    setError(null)
    setSuccess(null)
    setSaving(false)

    setPublicationId(initialPublicationId || '')

    const fetchPubs = async () => {
      setLoadingPubs(true)
      try {
        const resp = await fetch('/api/publications')
        const json = await resp.json().catch(() => null)
        if (!resp.ok) {
          setPublications([])
          return
        }
        setPublications((json?.publications || []) as Publication[])
      } finally {
        setLoadingPubs(false)
      }
    }

    void fetchPubs()
  }, [initialPublicationId, isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      const isModifier = event.metaKey || event.ctrlKey
      if (isModifier && event.key === 'Enter') {
        event.preventDefault()
        if (!saving) void submit()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, saving, type, title, content, tags, publicationId])

  const canSave = useMemo(() => content.trim().length > 0 && !saving, [content, saving])

  const close = () => {
    onClose()
    // reset minimal state so the next open feels fresh
    setSuccess(null)
    setError(null)
  }

  const submit = async () => {
    const trimmed = content.trim()
    if (!trimmed) {
      setError('Content is required.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const resp = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim() || undefined,
          content: trimmed,
          tags,
          publication_id: publicationId || undefined,
        }),
      })

      const json = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(json?.error || 'Failed to capture.')
        return
      }

      const id = typeof json?.id === 'string' ? json.id : null
      if (!id) {
        setError('Capture succeeded but returned no asset id.')
        return
      }

      setSuccess('Saved to Captures.')
      // Keep the workflow moving: go to the captured capture item.
      close()
      router.push(`/dashboard/captures/${encodeURIComponent(id)}`)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm px-4 py-16"
      role="dialog"
      aria-modal="true"
      aria-label="Quick capture"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--border-light)]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">Quick Capture</p>
            <p className="text-xs text-[var(--text-tertiary)]">Save snippets, quotes, ideas, or links to use in your posts later - Ctrl+Enter to save</p>
          </div>
          <button
            onClick={close}
            className="text-xs text-[var(--text-tertiary)] border border-[var(--border-light)] rounded px-2 py-1 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            ESC
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste a quote, snippet, link, or idea you want to save for later..."
              className="w-full input min-h-[140px]"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AssetType)}
                className="w-full input"
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Publication</label>
              <select
                value={publicationId}
                onChange={(e) => setPublicationId(e.target.value)}
                className="w-full input"
                disabled={loadingPubs}
              >
                <option value="">Global Captures</option>
                {publications.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional title"
              className="w-full input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Tags</label>
            <TagSelect selectedTags={tags} onChange={setTags} maxTags={50} />
          </div>

          {error && (
            <div className="text-sm text-[var(--error)]">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-[var(--accent)]">
              {success}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--border-light)] flex items-center justify-end gap-2">
          <button onClick={close} className="btn btn-secondary btn-sm">
            Cancel
          </button>
          <button onClick={submit} className="btn btn-primary btn-sm" disabled={!canSave}>
            {saving ? 'Saving...' : 'Save to Captures'}
          </button>
        </div>
      </div>
    </div>
  )
}
