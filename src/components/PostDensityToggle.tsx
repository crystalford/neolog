'use client'

import { useMemo, useState } from 'react'

type Density = 'summary' | 'full'

interface PostDensityToggleProps {
  postId: string
  summary: string
  bullets: string[]
  html: string
  model?: string | null
}

export function PostDensityToggle({ postId, summary, bullets, html, model }: PostDensityToggleProps) {
  const [density, setDensity] = useState<Density>('full')
  const [summaryText, setSummaryText] = useState(summary)
  const [summaryBullets, setSummaryBullets] = useState(bullets)
  const [summaryModel, setSummaryModel] = useState(model || 'fallback')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cleanedBullets = useMemo(() => {
    return summaryBullets.filter((sentence) => sentence.length >= 20).slice(0, 5)
  }, [summaryBullets])

  const processed = useMemo(() => {
    if (typeof window === 'undefined') {
      return { html, toc: [] as Array<{ id: string; text: string }> }
    }

    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const toc: Array<{ id: string; text: string }> = []
      const usedIds = new Set<string>()

      const slugify = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9\\s-]/g, '')
          .replace(/\\s+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 60)

      const headings = Array.from(doc.querySelectorAll('h2, h3'))
      headings.forEach((heading) => {
        const text = heading.textContent?.trim() || ''
        if (!text) return
        let id = heading.getAttribute('id') || slugify(text)
        if (!id) return
        if (usedIds.has(id)) {
          let i = 2
          while (usedIds.has(`${id}-${i}`)) i += 1
          id = `${id}-${i}`
        }
        usedIds.add(id)
        heading.setAttribute('id', id)
        toc.push({ id, text })
      })

      return { html: doc.body.innerHTML, toc }
    } catch (error) {
      console.error('Density HTML parse error:', error)
      return { html, toc: [] as Array<{ id: string; text: string }> }
    }
  }, [html])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Variable density</p>
          <p className="text-sm text-gray-700">Choose how much detail you want.</p>
        </div>
        <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 text-xs font-medium">
          {(['summary', 'full'] as Density[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setDensity(mode)}
              className={`px-3 py-1 rounded-full transition-colors ${
                density === mode
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {mode === 'summary' ? 'Summary' : 'Full'}
            </button>
          ))}
        </div>
      </div>

      {density === 'summary' ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">AI summary</p>
              <p className="text-sm text-gray-600">
                Model: {summaryModel || 'fallback'}
              </p>
            </div>
            <button
              onClick={async () => {
                setLoading(true)
                setError(null)
                try {
                  const response = await fetch('/api/posts/summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postId }),
                  })
                  const data = await response.json()
                  if (!response.ok) {
                    setError(data.error || 'Failed to generate summary')
                  } else {
                    setSummaryText(data.summary.summary || summaryText)
                    setSummaryBullets(data.summary.bullets || summaryBullets)
                    setSummaryModel(data.summary.model || summaryModel)
                  }
                } catch (err) {
                  console.error('Summary error:', err)
                  setError('Failed to generate summary')
                } finally {
                  setLoading(false)
                }
              }}
              disabled={loading}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400 transition-colors disabled:opacity-60"
            >
              {loading ? 'Generating...' : 'Regenerate'}
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-500 mb-3">{error}</p>
          )}
          <p className="text-lg text-gray-800 leading-relaxed">{summaryText || 'Summary unavailable.'}</p>
          {cleanedBullets.length > 0 && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400 mb-3">Key takeaways</p>
              <ul className="space-y-2 text-sm text-gray-600">
                {cleanedBullets.map((sentence, index) => (
                  <li key={`${sentence}-${index}`} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span>{sentence}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {processed.toc.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400 mb-3">On this page</p>
              <div className="flex flex-wrap gap-2">
                {processed.toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400 transition-colors"
                  >
                    {item.text}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: processed.html }}
          />
        </div>
      )}
    </div>
  )
}
