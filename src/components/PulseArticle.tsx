import Link from 'next/link'
import { PulseContent } from '@/lib/pulse'

type PulseArticleProps = {
  pulse: PulseContent
}

const labelClass = (label: PulseContent['cards'][number]['label']) => {
  if (label === 'Hype') return 'pulse-label pulse-label--hype'
  if (label === 'Critic') return 'pulse-label pulse-label--critic'
  return 'pulse-label pulse-label--neutral'
}

const sentimentClass = (sentiment?: PulseContent['cards'][number]['sentiment']) => {
  if (sentiment === 'positive') return 'pulse-sentiment pulse-sentiment--positive'
  if (sentiment === 'negative') return 'pulse-sentiment pulse-sentiment--negative'
  return 'pulse-sentiment pulse-sentiment--neutral'
}

const sourceLabel = (source: string) => {
  if (source === 'x') return 'X'
  if (source === 'reddit') return 'Reddit'
  return 'Link'
}

const sourceBadge = (source: string) => {
  if (source === 'x') return 'pulse-platform pulse-platform--x'
  if (source === 'reddit') return 'pulse-platform pulse-platform--reddit'
  return 'pulse-platform pulse-platform--link'
}

export function PulseArticle({ pulse }: PulseArticleProps) {
  return (
    <section className="pulse-article">
      <div className="pulse-section">
        <p className="pulse-kicker">The brief</p>
        <div className="pulse-summary">
          {pulse.summary || 'Summary pending.'}
        </div>
      </div>

      <div className="pulse-section">
        <p className="pulse-kicker">The discourse</p>
        <div className="pulse-grid">
          {pulse.cards.length === 0 && (
            <div className="pulse-card">
              <p className="pulse-card__body">No sources added yet.</p>
            </div>
          )}
          {pulse.cards.map((card) => (
            <article key={card.id} className="pulse-card">
              <div className="pulse-card__meta">
                <span className={sourceBadge(card.source)}>{sourceLabel(card.source)}</span>
                <span className={labelClass(card.label)}>{card.label}</span>
                <span className={sentimentClass(card.sentiment)}>{card.sentiment || 'neutral'}</span>
              </div>
              <div className="pulse-card__header">
                <div className="pulse-avatar">
                  {card.avatar_url ? (
                    <img src={card.avatar_url} alt="" />
                  ) : (
                    <span>{(card.author || 'S').slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="pulse-card__author">{card.author || 'Source'}</div>
                  {card.timestamp && (
                    <div className="pulse-card__time">{card.timestamp}</div>
                  )}
                </div>
              </div>
              <p className="pulse-card__body">{card.body}</p>
              {card.url && (
                <Link href={card.url} className="pulse-card__link" target="_blank" rel="noreferrer">
                  View source
                </Link>
              )}
            </article>
          ))}
        </div>
      </div>

      {pulse.takeaway && (
        <div className="pulse-section">
          <p className="pulse-kicker">So what</p>
          <div className="pulse-takeaway">{pulse.takeaway}</div>
        </div>
      )}
    </section>
  )
}
