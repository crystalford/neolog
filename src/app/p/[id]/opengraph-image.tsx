/**
 * OG image for /p/[id] — what shows up when a public production link
 * is pasted into X / Slack / iMessage. 1200×630 PNG, pure black with
 * cobalt accent + topic-colored badge + production title.
 *
 * Uses Next.js's ImageResponse from next/og — Edge-compatible,
 * generated on demand. Fetched via the next/og runtime per Next.js
 * 13+ file conventions: place opengraph-image.tsx alongside page.tsx
 * and the framework wires it up as the og:image URL.
 *
 * Fallback when production isn't public: generic neolog card.
 */

import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'

export const runtime = 'edge'
export const alt = 'A piece from neolog'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

interface PublicProduction {
  id: string; type: string; title: string | null
  attribution: string | null; body: string
}

const TYPE_LABEL: Record<string, string> = {
  video_essay: 'Video essay',
  article: 'Article',
  x_post: 'Post',
  x_thread: 'Thread',
  clip: 'Clip',
  creative_work: 'Creative',
}

const TYPE_COLOR: Record<string, string> = {
  video_essay: '#a47ad1',  // plum
  article:     '#e6634a',  // terra
  x_post:      '#e07598',  // rose
  x_thread:    '#e07598',  // rose
  clip:        '#c89640',  // ochre
  creative_work: '#a47ad1', // plum
}

async function fetchProduction(id: string, host: string): Promise<PublicProduction | null> {
  try {
    const proto = host.includes('localhost') ? 'http' : 'https'
    const res = await fetch(`${proto}://${host}/api/p/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data: any = await res.json()
    return data?.production ?? null
  } catch {
    return null
  }
}

export default async function OpengraphImage({ params }: { params: { id: string } }) {
  const h = headers()
  const host = h.get('host') || 'neolog.ai'
  const p = await fetchProduction(params.id, host)

  const title = p?.title || 'neolog'
  const typeLabel = p ? (TYPE_LABEL[p.type] || p.type.replace(/_/g, ' ')) : 'Personal life graph'
  const accent = p ? (TYPE_COLOR[p.type] || '#5b8df6') : '#5b8df6'
  const attribution = p?.attribution || 'neolog operator'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'black',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 72px',
          position: 'relative',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Radial accent glow top-right */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 700,
            height: 700,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}22 0%, ${accent}00 70%)`,
            display: 'flex',
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#fafafa',
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '-0.6px',
            zIndex: 1,
          }}
        >
          {/* Filament logo */}
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
            <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
            <circle cx="3" cy="16" r="2.6" fill="white"/>
            <circle cx="29" cy="16" r="2.6" fill="white"/>
          </svg>
          <span>neolog</span>
        </div>

        {/* Type pill */}
        <div
          style={{
            marginTop: 70,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 18px',
            border: `2px solid ${accent}`,
            borderRadius: 100,
            fontSize: 17,
            color: accent,
            letterSpacing: 2,
            textTransform: 'uppercase',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }}/>
          {typeLabel.toUpperCase()}
        </div>

        {/* Title */}
        <div
          style={{
            marginTop: 36,
            fontSize: 76,
            fontWeight: 400,
            lineHeight: 1.0,
            letterSpacing: '-3px',
            color: '#fafafa',
            zIndex: 1,
            maxWidth: 1080,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical' as any,
          }}
        >
          {title}
          <span style={{ color: accent }}>.</span>
        </div>

        {/* Spacer to push footer down */}
        <div style={{ flex: 1, display: 'flex' }}/>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#a1a1aa',
            fontSize: 18,
            zIndex: 1,
            borderTop: '1px solid #2e2e2e',
            paddingTop: 22,
          }}
        >
          <span>
            by <span style={{ color: '#fafafa', fontWeight: 500 }}>{attribution}</span>
          </span>
          <span style={{ letterSpacing: 2, textTransform: 'uppercase', fontSize: 14, color: '#71717a' }}>
            neolog.ai
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
