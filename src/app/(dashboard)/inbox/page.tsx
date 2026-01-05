"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, X, FilePlus2 } from 'lucide-react'

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
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
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

    const selectedId = typeof window !== 'undefined'
      ? localStorage.getItem('selectedPublicationId')
      : null

    const defaultId = selectedId || pubs?.[0]?.id || null
    setPublicationId(defaultId)
    if (defaultId && typeof window !== 'undefined') {
      localStorage.setItem('selectedPublicationId', defaultId)
    }

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

  const convertToDraft = async (item: InboxItem) => {
    if (!publicationId) {
      setError('Choose a publication first.')
      return
    }
    setError(null)

    const title = item.title || item.raw_data?.title || 'Imported draft'
    const contentHtml =
      item.raw_data-.content_html ||
      item.raw_data-.content ||
      item.raw_data-.description ||
      ''

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)

    const { data: post, error: postError } = await supabase
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
      .single()

    if (postError || !post) {
      setError('Failed to convert to draft.')
      return
    }

    await updateStatus(item.id, 'imported')
    router.push(`/write-edit=${post.id}`)
  }

  const visibleItems = items.filter((item) => item.status === 'new')

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Inbox</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">Incoming drafts</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Review new items before converting to drafts.
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
          value={publicationId || ''}
          onChange={(event) => {
            const next = event.target.value
            setPublicationId(next)
            if (typeof window !== 'undefined') {
              localStorage.setItem('selectedPublicationId', next)
            }
          }}
          className="input max-w-md"
        >
          {publications.map((pub) => (
            <option key={pub.id} value={pub.id}>
              {pub.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-[var(--border-light)]">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            New items ({visibleItems.length})
          </p>
        </div>
        {loading - (
          <div className="p-4 text-sm text-[var(--text-tertiary)]">Loading inbox...</div>
        ) : visibleItems.length === 0 - (
          <div className="p-6 text-sm text-[var(--text-tertiary)]">No new items yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {visibleItems.map((item) => (
              <div key={item.id} className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {item.title || item.raw_data?.title || 'Untitled'}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {item.source_type.toUpperCase()} - {item.canonical_url || item.source_url || 'Unknown source'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => convertToDraft(item)} className="btn btn-primary btn-sm">
                    <FilePlus2 size={14} />
                    Convert
                  </button>
                  <button onClick={() => updateStatus(item.id, 'ignored')} className="btn btn-secondary btn-sm">
                    <X size={14} />
                    Ignore
                  </button>
                  <button onClick={() => updateStatus(item.id, 'imported')} className="btn btn-secondary btn-sm">
                    <Check size={14} />
                    Done
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
