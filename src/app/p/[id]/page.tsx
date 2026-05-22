/**
 * /p/[id] — public production view.
 *
 * Server component: exports generateMetadata so OG tags + page <title>
 * reflect the actual production (title + attribution + type). The
 * interactive body lives in PublicView.tsx (client).
 *
 * generateMetadata + opengraph-image.tsx run server-side on each
 * request. They hit /api/p/[id] to fetch the production info. If the
 * production isn't public (404), metadata falls back to a generic
 * "Not published" card.
 *
 * Cloudflare Access policy needs /p/*, /api/p/*, AND the OG image
 * route in the public exclusion list — otherwise crawlers can't
 * resolve the metadata.
 */

export const runtime = 'edge'

import type { Metadata } from 'next'
import PublicView from './PublicView'

interface PublicProduction {
  id: string
  type: string
  title: string | null
  attribution: string | null
  body: string
  produced_at: string | null
  created_at: string
}

async function fetchProduction(id: string, host: string): Promise<PublicProduction | null> {
  try {
    const proto = host.includes('localhost') ? 'http' : 'https'
    const res = await fetch(`${proto}://${host}/api/p/${encodeURIComponent(id)}`, {
      // The route is public; no need for cookies. Cache briefly to avoid
      // double-fetching on every social-card refresh.
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data: any = await res.json()
    return data?.production ?? null
  } catch {
    return null
  }
}

const TYPE_LABEL: Record<string, string> = {
  video_essay: 'Video essay',
  article: 'Article',
  x_post: 'Post',
  x_thread: 'Thread',
  clip: 'Clip',
  creative_work: 'Creative',
}

export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  // Best-effort metadata — if the fetch fails (e.g. production isn't
  // public), fall back to a generic title.
  const { headers } = await import('next/headers')
  const h = headers()
  const host = h.get('host') || 'neolog.ai'

  const p = await fetchProduction(params.id, host)
  if (!p) {
    return {
      title: 'Not published · neolog',
      description: "This piece isn't public.",
    }
  }
  const title = p.title || 'Untitled'
  const typeLabel = TYPE_LABEL[p.type] || p.type
  const description = (p.body || '').trim().replace(/\s+/g, ' ').slice(0, 200)
    || `${typeLabel} by ${p.attribution || 'neolog operator'}.`
  const fullTitle = `${title} · neolog`

  return {
    title: fullTitle,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      // opengraph-image.tsx in this directory provides the og:image
      // automatically per Next.js file conventions; no need to set
      // images here. Listing it doesn't hurt though.
      siteName: 'neolog',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default function PublicProductionPage({ params }: { params: { id: string } }) {
  return <PublicView id={params.id}/>
}
