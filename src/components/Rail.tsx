'use client'

/**
 * The rail on an unlisted list — `source.html`, `asks.html`, `numbers.html`
 * and `dossier.html` all carry the same two cards, so it is one component
 * rather than four copies that drift.
 *
 * **Goes to** — the places this page's own text points at, gathered. The
 * design's version lists the actual links from the page above it, so a
 * reader who has scrolled past one can still reach it.
 *
 * **Elsewhere** — the log, and every page. Two doors, always the same two.
 *
 * There is no third card. The rail on these pages is a way onward, not a
 * place for the log to say anything, and a card that summarised or counted
 * would be the log commenting (§0 rule 2).
 */

import Link from 'next/link'
import type { ReactNode } from 'react'

export function Rail(
  { goesTo, lead }: {
    goesTo?: { href: string; label: ReactNode }[]
    /**
     * A card above **Goes to**, for a page whose design puts one there —
     * `search.html`'s "Where the hits are". It is a slot rather than a
     * second component so the two doors below it stay identical everywhere.
     */
    lead?: ReactNode
  },
) {
  return (
    <aside className="rail">
      {lead}
      {goesTo && goesTo.length > 0 && (
        <div className="rc">
          <div className="h">Goes to</div>
          {goesTo.map(g => (
            <div className="i" key={g.href}>
              <Link href={g.href}>{g.label}</Link>
            </div>
          ))}
        </div>
      )}
      <div className="rc">
        <div className="h">Elsewhere</div>
        <div className="acts">
          <Link href="/">the log</Link>
          <Link href="/everything">every page</Link>
        </div>
      </div>
    </aside>
  )
}
