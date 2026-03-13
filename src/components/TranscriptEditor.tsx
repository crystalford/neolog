'use client'
// Adapted from neolog-web-export/components/TranscriptEditor.tsx
// Changes: uses video_upload_id (not clipId), calls /api/transcript-words,
//          no clip tabs (single upload), uses Neolog design tokens

import { useState, useCallback, useMemo } from 'react'
import type { TranscriptWord } from '@/types/database'

interface Props {
  uploadId: string
  words: TranscriptWord[]
  onWordsUpdate: (words: TranscriptWord[]) => void
}

export function TranscriptEditor({ uploadId, words, onWordsUpdate }: Props) {
  const [pendingSave, setPendingSave] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const filteredWordIds = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return new Set(words.filter(w => w.word.toLowerCase().includes(q)).map(w => w.id))
  }, [words, searchQuery])

  async function toggleWordCut(wordId: string, currentlyCut: boolean) {
    // Optimistic update
    onWordsUpdate(words.map(w => w.id === wordId ? { ...w, is_cut: !currentlyCut } : w))
    setPendingSave(s => new Set(s).add(wordId))

    try {
      await fetch('/api/transcript-words', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordIds: [wordId], isCut: !currentlyCut }),
      })
    } finally {
      setPendingSave(s => {
        const next = new Set(s)
        next.delete(wordId)
        return next
      })
    }
  }

  async function toggleRangeCut(cut: boolean) {
    const wordIds = words.map(w => w.id)
    onWordsUpdate(words.map(w => ({ ...w, is_cut: cut })))

    await fetch('/api/transcript-words', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordIds, isCut: cut }),
    })
  }

  if (words.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 text-[var(--text-tertiary)]">
        <p className="text-sm">No word-level transcript available.</p>
        <p className="text-xs">This upload was processed without word timestamps.</p>
      </div>
    )
  }

  const cutCount = words.filter(w => w.is_cut).length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-3 border-b border-[var(--border-light)]">
        <input
          type="text"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-48 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
        />
        <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
          {words.length - cutCount} / {words.length} words kept
        </span>
        {pendingSave.size > 0 && (
          <span className="text-[10px] font-mono text-amber-400">Saving...</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => toggleRangeCut(false)}
            className="text-[10px] font-mono text-[var(--accent)] hover:underline"
          >
            Keep all
          </button>
          <span className="text-[var(--border-light)]">·</span>
          <button
            onClick={() => toggleRangeCut(true)}
            className="text-[10px] font-mono text-[var(--text-tertiary)] hover:underline"
          >
            Cut all
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-auto py-4">
        <p className="leading-loose text-sm">
          {words.map(word => {
            const isHighlighted = filteredWordIds?.has(word.id)
            return (
              <button
                key={word.id}
                onClick={() => toggleWordCut(word.id, word.is_cut)}
                title={`${word.start_time.toFixed(2)}s — click to ${word.is_cut ? 'keep' : 'cut'}`}
                className={[
                  'mr-0.5 rounded px-0.5 py-0.5 transition-colors',
                  word.is_cut
                    ? 'text-[var(--text-tertiary)] opacity-40 line-through hover:bg-red-500/10'
                    : 'text-[var(--text-primary)] hover:bg-[var(--accent)]/10',
                  isHighlighted ? 'bg-yellow-400/20' : '',
                  pendingSave.has(word.id) ? 'opacity-50' : '',
                ].filter(Boolean).join(' ')}
              >
                {word.word}
              </button>
            )
          })}
        </p>
      </div>
    </div>
  )
}
