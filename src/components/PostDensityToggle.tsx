'use client'

import { useMemo, useState } from 'react'

type Density = 'summary' | 'full'

interface PostDensityToggleProps {
  summary: string
  bullets: string[]
  html: string
}

export function PostDensityToggle({ summary, bullets, html }: PostDensityToggleProps) {
  const [density, setDensity] = useState<Density>('full')

  const cleanedBullets = useMemo(() => {
    return bullets.filter((sentence) => sentence.length >= 40).slice(0, 4)
  }, [bullets])

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
          <p className="text-lg text-gray-800 leading-relaxed">{summary || 'Summary unavailable.'}</p>
          {cleanedBullets.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              {cleanedBullets.map((sentence, index) => (
                <li key={`${sentence}-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <span>{sentence}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  )
}
