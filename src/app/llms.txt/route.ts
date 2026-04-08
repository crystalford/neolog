export const runtime = 'edge'
import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

  const body = `# Neolog

Neolog is an intelligence-first video and audio journal.

## Core Features
- Video/Audio Log Ingestion
- Semantic Search & Knowledge Graph
- Narrative Synthesis & Pattern Discovery

## Discovery
- Robots:  ${baseUrl}/robots.txt
- Sitemap: ${baseUrl}/sitemap.xml
`

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
