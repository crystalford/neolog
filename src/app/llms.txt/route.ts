import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

  const body = `# Neolog

Neolog is a protocol-native publishing platform.

## Preferred machine-readable endpoints

### Profile JSON
- ${baseUrl}/{username}?format=json
  - Rewrites to: ${baseUrl}/api/agent/user?username={username}

### Post JSON
- ${baseUrl}/{username}/{slug}?format=json
  - Rewrites to: ${baseUrl}/api/agent/post?username={username}&slug={slug}

### Feeds
- User RSS:  ${baseUrl}/{username}/feed
- User Atom: ${baseUrl}/{username}/feed?format=atom
- User JSON: ${baseUrl}/{username}/feed?format=json

- Global RSS:  ${baseUrl}/api/feeds/global
- Global Atom: ${baseUrl}/api/feeds/global?format=atom
- Global JSON: ${baseUrl}/api/feeds/global?format=json

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
