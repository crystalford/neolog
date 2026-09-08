'use client'

/**
 * The glossary — every term and subject, with the sentence it was first
 * said in.
 *
 * `source.html`, the unlisted list: "the same entries as the log's filters,
 * collected." A term's point is its FIRST use, so the coining sentence is
 * what the row shows — his words, on their date, linking to the entry.
 *
 * The paragraph under a name is marked when the log wrote it. It becomes his
 * the moment he edits it on the page itself, and the mark disappears then —
 * never before.
 *
 * DefinedTermSet in the source, so a machine reading this gets the same
 * thing a person does. The schema block is generated from the rows on
 * screen, so it can never claim something the page does not show.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import Stamp from '@/components/Stamp'
import OwnerStrip from '@/components/OwnerStrip'

interface Item {
  id: string; name: string; kind: string
  summary: string | null; summary_author: 'log' | 'operator'
  first_said: string | null; first_said_at: string | null; first_said_id: string | null
  entry_count: number; named_by_system: boolean; href: string
}

const KIND_WORD: Record<string, string> = {
  term: 'a word', subject: 'a subject', project: 'a project', thing: 'a thing',
}

export default function Glossary() {
  const [items, setItems] = useState<Item[]>([])
  const [changed, setChanged] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/public/glossary', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json() as { items: Item[]; last_changed: string | null }
        setItems(j.items || [])
        setChanged(j.last_changed)
      }
    } catch { /* the page says nothing yet */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  // The schema is built from what is rendered, never from a second source.
  const jsonLd = useMemo(() => JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'The glossary',
    hasDefinedTerm: items.map(i => ({
      '@type': 'DefinedTerm',
      name: i.name,
      ...(i.summary ? { description: i.summary } : {}),
      url: i.href,
    })),
  }), [items])

  return (
    <Shell>
      <div className="logpage pg-source">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/everything">everything</Link>
        </div>

        <div className="grid">
          <main>

        <div className="pghead"><h1>The glossary</h1></div>
        <OwnerStrip signedIn={!loading} />
        <Stamp at={changed} unlisted />

        <p className="none" style={{ paddingBottom: 0 }}>
          Every name that has a page of its own, with the sentence it was
          first said in. The same names are on the log, on the day each was
          said; this is the list version.
        </p>

        {loading && <div className="none">Reading the log.</div>}

        {!loading && !items.length && (
          <div className="none">
            Nothing has a page yet. Pages are made from the names the log
            found in what you have already said — <Link href="/pages">the index</Link> is
            where they are made.
          </div>
        )}

        {items.map(i => (
          <div className="item" key={i.id}>
            <div className="x"><Link href={i.href}>{i.name}</Link></div>
            <div className="m">
              <span>{KIND_WORD[i.kind] || i.kind}</span>
              {i.entry_count > 0 && (
                <span>{i.entry_count} {i.entry_count === 1 ? 'entry' : 'entries'}</span>
              )}
              {i.named_by_system && <span>named by the log</span>}
            </div>
            {i.summary && (
              <div className="p">
                {i.summary}
                {i.summary_author === 'log' && (
                  <em style={{ display: 'block', fontStyle: 'normal', marginTop: 7, fontSize: 12.5, color: 'var(--fg-4)' }}>
                    written by the log
                  </em>
                )}
              </div>
            )}
            {i.first_said && (
              <div className="said">
                {i.first_said}
                <em>
                  first said
                  {i.first_said_at ? ` ${new Date(i.first_said_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  {i.first_said_id ? ' · ' : ''}
                  {i.first_said_id && <Link href={`/entry/${i.first_said_id}`}>the entry</Link>}
                </em>
              </div>
            )}
          </div>
        ))}

        {items.length > 0 && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        )}
                </main>

          <Rail goesTo={[{ href: '/pages', label: 'the index' }, { href: '/public', label: 'the log' }, { href: '/asks', label: 'the questions' }]} />
        </div>
      </div>
    </Shell>
  )
}
