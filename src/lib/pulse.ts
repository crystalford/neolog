export type PulseCardLabel = 'Hype' | 'Critic' | 'Neutral'
export type PulseCardSentiment = 'positive' | 'negative' | 'neutral'
export type PulseCardSource = 'x' | 'reddit' | 'link'

export type PulseCard = {
  id: string
  label: PulseCardLabel
  source: PulseCardSource
  sentiment?: PulseCardSentiment
  author: string
  body: string
  url: string
  avatar_url?: string
  timestamp?: string
}

export type PulseContent = {
  summary: string
  takeaway: string
  cards: PulseCard[]
}

export const MAX_PULSE_CARDS = 6

export const createEmptyPulse = (): PulseContent => ({
  summary: '',
  takeaway: '',
  cards: [],
})

export const createPulseTemplate = (): PulseContent => ({
  summary: 'Write a 150-word brief that captures the core facts, players, and stakes.',
  takeaway: 'Summarize why this matters and what readers should watch next.',
  cards: [
    {
      id: `pulse_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label: 'Hype',
      sentiment: 'positive',
      source: 'x',
      author: '@source',
      body: 'Key supportive quote or insight.',
      url: '',
    },
    {
      id: `pulse_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label: 'Critic',
      sentiment: 'negative',
      source: 'reddit',
      author: 'u/source',
      body: 'Pushback, critique, or cautionary take.',
      url: '',
    },
    {
      id: `pulse_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label: 'Neutral',
      sentiment: 'neutral',
      source: 'link',
      author: 'Reporter',
      body: 'A factual update or data point.',
      url: '',
    },
  ],
})

export const parsePulseContent = (raw?: string | null): PulseContent => {
  if (!raw) return createEmptyPulse()
  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pulse_${Date.now()}_${Math.random().toString(16).slice(2)}`
  try {
    const parsed = JSON.parse(raw) as {
      summary?: unknown
      takeaway?: unknown
      cards?: unknown
    }
    const cards: unknown[] = Array.isArray(parsed.cards)
      ? parsed.cards.slice(0, MAX_PULSE_CARDS)
      : []
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      !!value && typeof value === 'object'
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      takeaway: typeof parsed.takeaway === 'string' ? parsed.takeaway : '',
      cards: cards
        .filter((card): card is Record<string, unknown> => isRecord(card))
        .map((card) => ({
          id: typeof card.id === 'string' ? card.id : createId(),
          label: card.label === 'Hype' || card.label === 'Critic' ? card.label : 'Neutral',
          source: card.source === 'reddit' || card.source === 'link' ? card.source : 'x',
          sentiment:
            card.sentiment === 'positive' || card.sentiment === 'negative'
              ? card.sentiment
              : 'neutral',
          author: typeof card.author === 'string' ? card.author : '',
          body: typeof card.body === 'string' ? card.body : '',
          url: typeof card.url === 'string' ? card.url : '',
          avatar_url: typeof card.avatar_url === 'string' ? card.avatar_url : '',
          timestamp: typeof card.timestamp === 'string' ? card.timestamp : '',
        })),
    }
  } catch (error) {
    return createEmptyPulse()
  }
}

export const serializePulseContent = (pulse: PulseContent): string =>
  JSON.stringify({
    summary: pulse.summary.trim(),
    takeaway: pulse.takeaway.trim(),
    cards: pulse.cards.slice(0, MAX_PULSE_CARDS).map((card) => ({
      id: card.id,
      label: card.label,
      source: card.source,
      sentiment: card.sentiment || 'neutral',
      author: card.author.trim(),
      body: card.body.trim(),
      url: card.url.trim(),
      avatar_url: card.avatar_url?.trim() || '',
      timestamp: card.timestamp || '',
    })),
  })

export const pulseWordCount = (pulse: PulseContent): number => {
  const text = [
    pulse.summary,
    pulse.takeaway,
    ...pulse.cards.map((card) => `${card.author} ${card.body}`),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return 0
  return text.split(' ').filter(Boolean).length
}

export const pulseExcerpt = (pulse: PulseContent): string => {
  const base = pulse.summary.trim() || pulse.cards[0]?.body?.trim() || ''
  if (!base) return ''
  return base.length > 160 ? `${base.slice(0, 157)}...` : base
}
