'use client'

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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-4">
        <label className="block text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
          The brief
        </label>
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
