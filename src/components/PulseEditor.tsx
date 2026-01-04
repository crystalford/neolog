'use client'

import { useState } from 'react'
import { PulseContent, PulseCard, MAX_PULSE_CARDS } from '@/lib/pulse'

type PulseEditorProps = {
  pulse: PulseContent
  onChange: (next: PulseContent) => void
}

const createCard = (): PulseCard => ({
  id: `pulse_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  label: 'Neutral',
  source: 'x',
  author: '',
  body: '',
  url: '',
})

export function PulseEditor({ pulse, onChange }: PulseEditorProps) {
  const [topic, setTopic] = useState('')
  const [curating, setCurating] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  const update = (patch: Partial<PulseContent>) => {
    onChange({ ...pulse, ...patch })
  }

  const updateCard = (id: string, patch: Partial<PulseCard>) => {
    const cards = pulse.cards.map((card) => (card.id === id ? { ...card, ...patch } : card))
    onChange({ ...pulse, cards })
  }

  const addCard = () => {
    if (pulse.cards.length >= MAX_PULSE_CARDS) return
    onChange({ ...pulse, cards: [...pulse.cards, createCard()] })
  }

  const removeCard = (id: string) => {
    onChange({ ...pulse, cards: pulse.cards.filter((card) => card.id !== id) })
  }

  const resolveCard = async (card: PulseCard) => {
    if (!card.url) return
    setResolvingId(card.id)
    try {
      const response = await fetch('/api/pulse/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: card.url }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Resolve failed')
      }
      updateCard(card.id, {
        source: data.card?.source || card.source,
        label: data.card?.label || card.label,
        author: data.card?.author || card.author,
        body: data.card?.body || card.body,
        url: data.card?.url || card.url,
      })
    } catch (error) {
      console.error('Resolve error:', error)
    } finally {
      setResolvingId(null)
    }
  }

  const curateSources = async () => {
    if (!topic.trim()) return
    setCurating(true)
    try {
      const response = await fetch('/api/pulse/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Curation failed')
      }
      const curated = Array.isArray(data.cards) ? data.cards : []
      const nextCards = curated.slice(0, MAX_PULSE_CARDS).map((item: any) => ({
        id: createCard().id,
        label: item.label || 'Neutral',
        source: item.source || 'link',
        author: item.author || '',
        body: item.body || '',
        url: item.url || '',
      }))
      onChange({ ...pulse, cards: nextCards })
    } catch (error) {
      console.error('Curation error:', error)
    } finally {
      setCurating(false)
    }
  }

  const applyTemplate = () => {
    onChange({
      summary: 'Write a 150-word brief that captures the core facts, players, and stakes.',
      takeaway: 'Summarize why this matters and what readers should watch next.',
      cards: [
        { ...createCard(), label: 'Hype', source: 'x', author: '@source', body: 'Key supportive quote or insight.', url: '' },
        { ...createCard(), label: 'Critic', source: 'reddit', author: 'u/source', body: 'Pushback, critique, or cautionary take.', url: '' },
        { ...createCard(), label: 'Neutral', source: 'link', author: 'Reporter', body: 'A factual update or data point.', url: '' },
      ],
    })
  }

  const generateSummary = async () => {
    if (pulse.cards.length === 0) return
    setSummarizing(true)
    try {
      const response = await fetch('/api/pulse/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: pulse.cards }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Summary failed')
      }
      onChange({
        ...pulse,
        summary: data.summary || pulse.summary,
        takeaway: data.takeaway || pulse.takeaway,
      })
    } catch (error) {
      console.error('Pulse summary error:', error)
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
              Auto-collect sources
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic keyword (e.g., Vibe coding)"
              className="input"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <button
              onClick={curateSources}
              className="btn btn-primary btn-sm"
              disabled={curating || !topic.trim()}
            >
              {curating ? 'Collecting...' : 'Collect'}
            </button>
            <button
              onClick={applyTemplate}
              className="btn btn-secondary btn-sm"
            >
              Pulse template
            </button>
          </div>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          Pulls recent Reddit + Hacker News sources and fills up to six cards.
        </p>
      </div>
      <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            The brief
          </label>
          <button
            onClick={generateSummary}
            className="btn btn-ghost btn-sm"
            disabled={summarizing || pulse.cards.length === 0}
          >
            {summarizing ? 'Generating...' : 'Generate brief'}
          </button>
        </div>
        <textarea
          value={pulse.summary}
          onChange={(e) => update({ summary: e.target.value })}
          placeholder="Write a crisp 150-word summary of the story."
          className="editor-textarea min-h-[140px]"
        />
      </div>

      <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            The discourse ({pulse.cards.length}/{MAX_PULSE_CARDS})
          </label>
          <button
            onClick={addCard}
            className="btn btn-secondary btn-sm"
            disabled={pulse.cards.length >= MAX_PULSE_CARDS}
          >
            Add card
          </button>
        </div>
        <div className="space-y-4">
          {pulse.cards.map((card) => (
            <div key={card.id} className="pulse-editor-card">
              <div className="pulse-editor-card__row">
                <select
                  className="input"
                  value={card.label}
                  onChange={(e) =>
                    updateCard(card.id, { label: e.target.value as PulseCard['label'] })
                  }
                >
                  <option value="Hype">Hype</option>
                  <option value="Critic">Critic</option>
                  <option value="Neutral">Neutral</option>
                </select>
                <select
                  className="input"
                  value={card.source}
                  onChange={(e) =>
                    updateCard(card.id, { source: e.target.value as PulseCard['source'] })
                  }
                >
                  <option value="x">X</option>
                  <option value="reddit">Reddit</option>
                  <option value="link">Link</option>
                </select>
                <button
                  onClick={() => removeCard(card.id)}
                  className="btn btn-ghost btn-sm"
                >
                  Remove
                </button>
              </div>
              <input
                className="input"
                value={card.author}
                onChange={(e) => updateCard(card.id, { author: e.target.value })}
                placeholder="Author handle"
              />
              <textarea
                className="editor-textarea min-h-[120px]"
                value={card.body}
                onChange={(e) => updateCard(card.id, { body: e.target.value })}
                placeholder="Paste the key quote or post text."
              />
              <input
                className="input"
                value={card.url}
                onChange={(e) => updateCard(card.id, { url: e.target.value })}
                placeholder="Source URL (X, Reddit, or link)"
              />
              <div className="flex items-center justify-end">
                <button
                  onClick={() => resolveCard(card)}
                  className="btn btn-ghost btn-sm"
                  disabled={!card.url || resolvingId === card.id}
                >
                  {resolvingId === card.id ? 'Fetching...' : 'Auto-fill from URL'}
                </button>
              </div>
            </div>
          ))}
          {pulse.cards.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">
              Add 2-6 cards to capture the conversation.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-4">
        <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
          Why it matters
        </label>
        <textarea
          value={pulse.takeaway}
          onChange={(e) => update({ takeaway: e.target.value })}
          placeholder="Add a short synthesis or conclusion."
          className="editor-textarea min-h-[120px]"
        />
      </div>
    </div>
  )
}
