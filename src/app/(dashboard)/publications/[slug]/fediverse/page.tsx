'use client'
export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FediverseBadge } from '@/components/FediverseBadge'
import { Globe, RefreshCw, UserMinus, ExternalLink } from 'lucide-react'

type Publication = {
  id: string
  slug: string
  name: string
}

type Follower = {
  id: string
  actor: string
  preferred_username: string | null
  display_name: string | null
  domain: string | null
  status: string
  followed_at: string
  last_seen_at: string | null
}

type Delivery = {
  id: string
  inbox_url: string
  status: string
  attempt_count: number
  last_attempt_at: string | null
  last_error: string | null
  response_status: number | null
}

export default function PublicationFediversePage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [publication, setPublication] = useState<Publication | null>(null)
  const [followers, setFollowers] = useState<Follower[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [params.slug])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('Please sign in to view this publication.')
      setLoading(false)
      return
    }

    const { data: pub, error: pubError } = await supabase
      .from('publications')
      .select('id, slug, name')
      .eq('slug', params.slug)
      .eq('owner_id', session.user.id)
      .single()

    if (pubError || !pub) {
      setError('Publication not found.')
      setLoading(false)
      return
    }

    setPublication(pub)

    const { data: followerRows } = await supabase
      .from('activitypub_publication_followers')
      .select('id, actor, preferred_username, display_name, domain, status, followed_at, last_seen_at')
      .eq('publication_id', pub.id)
      .order('followed_at', { ascending: false })

    setFollowers((followerRows as Follower[]) || [])

    const { data: deliveryRows } = await supabase
      .from('activitypub_publication_deliveries')
      .select('id, inbox_url, status, attempt_count, last_attempt_at, last_error, response_status')
      .eq('publication_id', pub.id)
      .order('last_attempt_at', { ascending: false })
      .limit(20)

    setDeliveries((deliveryRows as Delivery[]) || [])
    setLoading(false)
  }

  const handleRemoveFollower = async (actor: string) => {
    if (!publication) return
    await supabase
      .from('activitypub_publication_followers')
      .update({ status: 'rejected' })
      .eq('publication_id', publication.id)
      .eq('actor', actor)

    await loadData()
  }

  const handleRetryFailed = async () => {
    if (!publication) return
    setRetrying(true)
    try {
      const response = await fetch(`/api/activitypub/publications/${publication.slug}/retry`, {
        method: 'POST',
      })
      if (!response.ok) {
        setError('Retry failed. Please try again.')
      }
    } catch {
      setError('Retry failed. Please try again.')
    } finally {
      setRetrying(false)
      await loadData()
    }
  }

  const stats = useMemo(() => {
    const accepted = followers.filter((f) => f.status === 'accepted').length
    const failed = deliveries.filter((d) => d.status === 'failed').length
    const sent = deliveries.filter((d) => d.status === 'sent').length
    return { accepted, failed, sent }
  }, [followers, deliveries])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const fediverseDomain = new URL(appUrl).hostname
  const fediverseHandle = publication ? `@${publication.slug}@${fediverseDomain}` : ''
  const fediverseSearchUrl = `https://mastodon.social/search?q=${encodeURIComponent(fediverseHandle)}`

  return (
    <main className="px-6 lg:px-12 py-10 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Fediverse</p>
          <h1 className="font-display text-3xl text-[var(--text-primary)]">
            {publication?.name || 'Publication'} federation
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Followers and delivery status for this publication.
          </p>
          {publication && (
            <div className="mt-3">
              <FediverseBadge handle={fediverseHandle} searchUrl={fediverseSearchUrl} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRetryFailed}
            className="btn btn-secondary btn-sm"
            disabled={loading || retrying || !publication}
          >
            <RefreshCw size={14} />
            {retrying ? 'Retrying...' : 'Retry Failed'}
          </button>
          <button
            onClick={loadData}
            className="btn btn-secondary btn-sm"
            disabled={loading}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-4 text-sm text-[var(--text-secondary)]">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Followers</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)] mt-2">{stats.accepted}</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">accepted</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Deliveries</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)] mt-2">{stats.sent}</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">sent</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Failures</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)] mt-2">{stats.failed}</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">need retry</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-[var(--text-primary)]">Followers</h2>
            <span className="text-xs text-[var(--text-tertiary)]">{followers.length} total</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-xl skeleton" />
              ))}
            </div>
          ) : followers.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No followers yet.</p>
          ) : (
            <div className="space-y-3">
              {followers.map((follower) => (
                <div
                  key={follower.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {follower.display_name || follower.preferred_username || follower.actor}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{follower.actor}</p>
                    {follower.last_seen_at && (
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                        Last seen {new Date(follower.last_seen_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                      {follower.status}
                    </span>
                    {follower.status === 'accepted' && (
                      <button
                        onClick={() => handleRemoveFollower(follower.actor)}
                        className="btn btn-ghost btn-xs"
                        aria-label="Remove follower"
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-[var(--text-primary)]">Recent Deliveries</h2>
            <span className="text-xs text-[var(--text-tertiary)]">{deliveries.length} recent</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-xl skeleton" />
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No deliveries yet.</p>
          ) : (
            <div className="space-y-3">
              {deliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{delivery.inbox_url}</p>
                    <p className="text-sm font-medium text-[var(--text-primary)] mt-1">
                      {delivery.status}
                    </p>
                    {delivery.last_attempt_at && (
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                        {new Date(delivery.last_attempt_at).toLocaleString()}
                      </p>
                    )}
                    {delivery.last_error && (
                      <p className="text-[10px] text-[var(--error)] mt-1 truncate">
                        {delivery.last_error}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[10px] text-[var(--text-tertiary)]">
                    <span>{delivery.attempt_count} attempts</span>
                    {delivery.response_status && <span>{delivery.response_status}</span>}
                    <a
                      href={delivery.inbox_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      Inbox
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
