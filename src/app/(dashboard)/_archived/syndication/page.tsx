'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SyndicationPage() {
  const [loading, setLoading] = useState(true)
  const [integrationKeys, setIntegrationKeys] = useState<Array<{ provider: string; is_active: boolean }>>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      try {
        const response = await fetch('/api/integrations/list')
        if (response.ok) {
          const data = await response.json()
          setIntegrationKeys(Array.isArray(data?.keys) ? data.keys : [])
        }
      } catch {
        // ignore
      }
      setLoading(false)
    }
    loadSession()
  }, [])

  const isConnected = (provider: string) =>
    integrationKeys.some((k) => k.provider === provider && k.is_active)

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

      <div className="grid gap-3 md:grid-cols-2">
        {[
          { id: 'x', name: 'X (Threads)', desc: 'Post a 5-6 tweet thread on publish.' },
          { id: 'linkedin', name: 'LinkedIn', desc: 'Publish a short case study post.' },
          { id: 'reddit', name: 'Reddit', desc: 'Submit to a chosen subreddit.' },
          { id: 'threads', name: 'Threads (Meta)', desc: 'Publish a threaded summary post.' },
          { id: 'medium', name: 'Medium', desc: 'Syndicate with canonical URL for SEO.' },
          { id: 'devto', name: 'Dev.to', desc: 'Cross-post to the developer community.' },
          { id: 'resend', name: 'Newsletter (Resend)', desc: 'Email your subscribers on publish.' },
        ].map((item) => {
          const connected = isConnected(item.id)
          return (
          <div key={item.name} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{item.name}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{item.desc}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  {connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
              <button
                onClick={() => router.push('/settings')}
                className="btn btn-secondary btn-sm"
              >
                {connected ? 'Manage' : 'Connect'}
              </button>
            </div>
          </div>
        )})}
      </div>
    </main>
  )
}
