'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface UserMaturity {
  captureCount: number
  draftCount: number
  publishedCount: number
  subscriberCount: number
  publicationCount: number
  sourceCount: number
  stackCount: number
  loading: boolean
}

export interface CapabilityFlags {
  showVaultOrganization: boolean      // 3+ manual captures
  showThemeDetection: boolean         // 2 drafts referencing captures
  showLightweightAnalytics: boolean   // 1 publish
  showStacks: boolean                 // 3 publishes
  showSourcesMonitors: boolean        // Repeated external captures OR 1+ source
  showScheduling: boolean             // Consistent publishing cadence (3+ in 30 days)
  showEngagementPanel: boolean        // First subscriber
  showPublicationsManagement: boolean // 5+ posts OR first publication
  showWorkspaceTab: boolean           // 1+ draft
  showPublishedTab: boolean           // 1+ publish
}

export function useUserMaturity(userId: string | null): UserMaturity & { capabilities: CapabilityFlags } {
  const [maturity, setMaturity] = useState<UserMaturity>({
    captureCount: 0,
    draftCount: 0,
    publishedCount: 0,
    subscriberCount: 0,
    publicationCount: 0,
    sourceCount: 0,
    stackCount: 0,
    loading: true,
  })

  useEffect(() => {
    if (!userId) {
      setMaturity((prev) => ({ ...prev, loading: false }))
      return
    }

    const supabase = createClient()

    async function fetchMaturity() {
      const [
        capturesRes,
        postsRes,
        subscribersRes,
        publicationsRes,
        sourcesRes,
        stacksRes,
      ] = await Promise.all([
        // Count captures (vault assets)
        supabase
          .from('vault_assets')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        // Count posts by status
        supabase
          .from('posts')
          .select('status')
          .eq('author_id', userId),
        // Count subscribers
        supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', userId),
        // Count publications
        supabase
          .from('publications')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', userId),
        // Count sources
        supabase
          .from('feed_sources')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        // Count stacks (series)
        supabase
          .from('series')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', userId),
      ])

      const posts = postsRes.data || []
      const draftCount = posts.filter((p) => p.status === 'draft').length
      const publishedCount = posts.filter((p) => p.status === 'published').length

      setMaturity({
        captureCount: capturesRes.count || 0,
        draftCount,
        publishedCount,
        subscriberCount: subscribersRes.count || 0,
        publicationCount: publicationsRes.count || 0,
        sourceCount: sourcesRes.count || 0,
        stackCount: stacksRes.count || 0,
        loading: false,
      })
    }

    fetchMaturity()
  }, [userId])

  // Derive capability flags from maturity
  const capabilities: CapabilityFlags = {
    showVaultOrganization: maturity.captureCount >= 3,
    showThemeDetection: maturity.draftCount >= 2 && maturity.captureCount >= 2,
    showLightweightAnalytics: maturity.publishedCount >= 1,
    showStacks: maturity.publishedCount >= 3,
    showSourcesMonitors: maturity.sourceCount >= 1,
    showScheduling: maturity.publishedCount >= 3,
    showEngagementPanel: maturity.subscriberCount >= 1,
    showPublicationsManagement: maturity.publishedCount >= 5 || maturity.publicationCount >= 1,
    showWorkspaceTab: maturity.draftCount >= 1 || maturity.publishedCount >= 1,
    showPublishedTab: maturity.publishedCount >= 1,
  }

  return { ...maturity, capabilities }
}
