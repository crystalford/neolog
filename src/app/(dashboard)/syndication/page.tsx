'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SyndicationPage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setLoading(false)
    }
    loadSession()
  }, [])

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-12 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-4 w-32 skeleton rounded" />
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Syndication</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">Auto-post targets</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          Auto-posting requires platform API keys. Connect when you are ready.
        </p>
      </div>

      <div className="space-y-4">
        {[
          { name: 'X (Threads)', desc: 'Post a 5-6 tweet thread on publish.' },
          { name: 'LinkedIn', desc: 'Publish a short case study post.' },
          { name: 'Reddit', desc: 'Submit to a chosen subreddit.' },
          { name: 'Threads (Meta)', desc: 'Publish a threaded summary post.' },
          { name: 'Medium', desc: 'Syndicate with canonical URL for SEO.' },
          { name: 'Dev.to', desc: 'Cross-post to the developer community.' },
          { name: 'Newsletter (Resend)', desc: 'Email your subscribers on publish.' },
        ].map((item) => (
          <div key={item.name} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{item.name}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{item.desc}</p>
              </div>
              <button
                disabled
                className="btn btn-secondary btn-sm cursor-not-allowed text-[var(--text-tertiary)]"
              >
                Connect
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
