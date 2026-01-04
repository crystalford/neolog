export type PulseCardLabel = 'Hype' | 'Critic' | 'Neutral'
export type PulseCardSource = 'x' | 'reddit' | 'link'

export type PulseCard = {
  id: string
  label: PulseCardLabel
  source: PulseCardSource
  author: string
  body: string
  url: string
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

export const parsePulseContent = (raw?: string | null): PulseContent => {
  if (!raw) return createEmptyPulse()
  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pulse_${Date.now()}_${Math.random().toString(16).slice(2)}`
  try {
    const parsed = JSON.parse(raw)
    const cards = Array.isArray(parsed.cards) ? parsed.cards.slice(0, MAX_PULSE_CARDS) : []
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      takeaway: typeof parsed.takeaway === 'string' ? parsed.takeaway : '',
      cards: cards
        .filter((card) => card && typeof card === 'object')
        .map((card) => ({
          id: typeof card.id === 'string' ? card.id : createId(),
          label: card.label === 'Hype' || card.label === 'Critic' ? card.label : 'Neutral',
          source: card.source === 'reddit' || card.source === 'link' ? card.source : 'x',
          author: typeof card.author === 'string' ? card.author : '',
          body: typeof card.body === 'string' ? card.body : '',
          url: typeof card.url === 'string' ? card.url : '',
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
      author: card.author.trim(),
      body: card.body.trim(),
      url: card.url.trim(),
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
