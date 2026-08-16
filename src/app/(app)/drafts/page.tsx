'use client'

/**
 * Drafts — what the system prepared for you to review.
 *
 * Consolidates the three surfaces that used to be separate, unlinked
 * pages (Subjects, Topics, Clips) into one tab strip, reusing the same
 * pattern Studio already uses for its own tab switcher. These are the
 * engine's three "what should I make next" surfaces — before this page
 * existed, none of them had a real door: no nav entry, no dropdown entry,
 * reachable only if a home-page card happened to surface or by typing the
 * URL from memory.
 *
 * - Subjects — named concepts the librarian found in your own recordings
 * - Topics — type-a-subject research + script engine
 * - Clips — scored lines worth cutting, across every vlog
 *
 * Deep-linkable via ?tab=subjects|topics|clips (default: subjects).
 * /subjects, /topics, /clips redirect here for back-compat.
 */

export const runtime = 'edge'

import { Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Shell from '@/components/Shell'
import { SubjectsList } from '@/components/drafts/SubjectsList'
import { TopicsList } from '@/components/drafts/TopicsList'
import { ClipsList } from '@/components/drafts/ClipsList'

type Tab = 'subjects' | 'topics' | 'clips'
const TABS: { key: Tab; label: string }[] = [
  { key: 'subjects', label: 'Subjects' },
  { key: 'topics',   label: 'Topics' },
  { key: 'clips',    label: 'Clips' },
]

export default function DraftsPage() {
  return (
    <Suspense fallback={null}>
      <DraftsPageInner/>
    </Suspense>
  )
}

function DraftsPageInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const tab = useMemo<Tab>(() => {
    const t = sp?.get('tab')
    return t === 'topics' || t === 'clips' ? t : 'subjects'
  }, [sp])

  const setTab = (t: Tab) => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    router.replace(url.pathname + url.search)
  }

  return (
    <Shell>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}>
        <section style={{ padding: '48px 0 28px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
          }}>
            Drafts · what the system prepared
          </div>
          <h1 style={{
            fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 300, letterSpacing: '-2.5px',
            lineHeight: 1.02, color: 'var(--fg)', margin: 0,
          }}>
            Ready when you are.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--fg-2)', maxWidth: 620, marginTop: 18, lineHeight: 1.5 }}>
            Concepts pulled from what you&rsquo;ve already recorded, anything you&rsquo;ve typed in to
            research from scratch, and the sharpest lines worth cutting into a short — all in one place.
          </p>
        </section>

        <div className="canon-reveal d2" style={{
          display: 'flex', gap: 6, borderBottom: '1px solid var(--line)',
          paddingBottom: 18, marginBottom: 32,
        }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`canon-filter-chip ${tab === t.key ? 'active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'subjects' && <SubjectsList/>}
        {tab === 'topics' && <TopicsList/>}
        {tab === 'clips' && <ClipsList/>}
      </div>
    </Shell>
  )
}
