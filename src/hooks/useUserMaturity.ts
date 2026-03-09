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
  showCaptureOrganization: boolean    // 3+ manual captures
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
      try {
        const [
          postsRes,
        ] = await Promise.all([
          // Only keep posts if it exists, otherwise it will just be empty
          supabase
            .from('posts')
            .select('status')
            .eq('author_id', userId),
        ])

        const posts = postsRes?.data || []
        const draftCount = posts.filter((p: any) => p.status === 'draft').length
        const publishedCount = posts.filter((p: any) => p.status === 'published').length

        setMaturity({
          captureCount: 0,
          draftCount,
          publishedCount,
          subscriberCount: 0,
          publicationCount: 0,
          sourceCount: 0,
          stackCount: 0,
          loading: false,
        })
      } catch (err) {
        console.error('Maturity fetch error (legacy):', err)
        setMaturity((prev) => ({ ...prev, loading: false }))
      }
    }

    fetchMaturity()
  }, [userId])

  // Derive capability flags from maturity
  const capabilities: CapabilityFlags = {
    showCaptureOrganization: maturity.captureCount >= 3,
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
