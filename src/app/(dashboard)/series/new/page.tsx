'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function NewSeriesPage() {
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [researchDoc, setResearchDoc] = useState('')
  const [infographicHtml, setInfographicHtml] = useState('')
  const [essay, setEssay] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  const willCreateDrafts = {
    infographic: Boolean(infographicHtml.trim()),
    essay: Boolean(essay.trim()),
    research: Boolean(researchDoc.trim()),
  }
  const willCreateAnyDrafts = willCreateDrafts.infographic || willCreateDrafts.essay || willCreateDrafts.research

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setSaving(true)

    const hasStackContent = willCreateAnyDrafts

    try {
      const response = await fetch('/api/series/create-stack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          coverImageUrl: coverImage.trim() || null,
          researchDoc: researchDoc.trim() || null,
          infographicHtml: infographicHtml.trim() || null,
          essay: essay.trim() || null,
          createDrafts: hasStackContent,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const rolledBack = Boolean(data?.rolledBack)
        const base = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : 'Failed to create series'
        setError(rolledBack ? `${base} (rolled back; nothing was created)` : base)
        setSaving(false)
        return
      }

      const seriesId = String(data?.seriesId || '')
      if (!seriesId) {
        setError('Failed to create series (missing series id)')
        setSaving(false)
        return
      }
      const created = (data?.created || {}) as Record<string, { id?: string }>

      const url = new URL(`/series/${encodeURIComponent(seriesId)}`, window.location.origin)
      const createdIds = {
        infographic: created?.infographic?.id,
        essay: created?.essay?.id,
        research: created?.research?.id,
      }

      const anyCreated = Object.values(createdIds).some(Boolean)
      if (anyCreated) {
        url.searchParams.set('created', '1')
        if (createdIds.infographic) url.searchParams.set('infographic', createdIds.infographic)
        if (createdIds.essay) url.searchParams.set('essay', createdIds.essay)
        if (createdIds.research) url.searchParams.set('research', createdIds.research)
      }

      router.push(url.pathname + url.search)
    } catch {
      setError('Failed to create series (network or server error)')
      setSaving(false)
    }
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-2xl mx-auto">
      <div className="mb-8">
            <Link 
              href="/series" 
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to Series
            </Link>
            <h1 className="font-display text-3xl">Create Series</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Series Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                placeholder="e.g., Building a Startup, Learning Rust"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input min-h-[100px] resize-none"
                placeholder="What's this series about?"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Cover Image URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  className="input flex-1"
                  placeholder="https://..."
                />
              </div>
              {coverImage && (
                <img 
                  src={coverImage} 
                  alt="Cover preview" 
                  className="mt-3 w-full h-32 object-cover rounded-lg"
                />
              )}
            </div>

            <div className="pt-4 border-t border-[var(--border-light)]">
              <h2 className="font-display text-xl mb-2">Optional: Create starter drafts (research stack)</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Add any of the following and Neolog will create draft posts inside this series automatically.
              </p>

              {willCreateAnyDrafts && (
                <div className="mb-4 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <p className="text-sm text-[var(--text-secondary)] mb-2">Drafts that will be created</p>
                  <ul className="text-sm text-[var(--text-tertiary)] space-y-1">
                    {willCreateDrafts.infographic && <li>• Infographic (HTML)</li>}
                    {willCreateDrafts.essay && <li>• Essay</li>}
                    {willCreateDrafts.research && <li>• Research Dump</li>}
                  </ul>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Deep Research dump</label>
                  <textarea
                    value={researchDoc}
                    onChange={(e) => setResearchDoc(e.target.value)}
                    className="input min-h-[140px] resize-y"
                    placeholder="Paste the full Deep Research text here..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Infographic HTML</label>
                  <textarea
                    value={infographicHtml}
                    onChange={(e) => setInfographicHtml(e.target.value)}
                    className="input min-h-[140px] resize-y font-mono text-xs"
                    placeholder="Paste the infographic HTML page here..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Essay</label>
                  <textarea
                    value={essay}
                    onChange={(e) => setEssay(e.target.value)}
                    className="input min-h-[140px] resize-y"
                    placeholder="Paste your aphoristic essay here..."
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-[var(--error)]">{error}</p>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="btn btn-primary"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  willCreateAnyDrafts ? 'Create Series + Drafts' : 'Create Series'
                )}
              </button>
              <Link href="/series" className="btn btn-secondary">
                Cancel
              </Link>
            </div>
      </form>
    </main>
  )
}


