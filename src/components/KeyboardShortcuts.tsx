import type { Metadata } from 'next'
import './globals.css'
// REMOVED: import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export const metadata: Metadata = {
  title: 'Neolog — Write Without Friction',
  description: 'A publishing platform that respects your code. Drop HTML, paste markdown, publish instantly.',
  openGraph: {
    title: 'Neolog',
    description: 'A publishing platform that respects your code.',
    type: 'website',
  },
  alternates: {
    types: {
      'application/rss+xml': '/api/feeds/global',
      'application/atom+xml': '/api/feeds/global?format=atom',
      'application/feed+json': '/api/feeds/global?format=json',
    },
  },
  other: {
    'webmention': `${BASE_URL}/api/webmention`,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="webmention" href={`${BASE_URL}/api/webmention`} />
      </head>
      <body className="min-h-screen">
        {children}
        {/* Component removed to prevent build crash */}
      </body>
    </html>
  )
}