import type { Metadata } from 'next'
import './globals.css'
// REMOVED: import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Neolog - Your Life Extended',
  description: 'Capture everything. Build a living map of your thinking. 100% sovereign.',
  openGraph: {
    title: 'Neolog',
    description: 'Capture everything. Build a living map of your thinking.',
    type: 'website',
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
      </head>
      <body className="min-h-screen">
        {children}
        {/* REMOVED: <KeyboardShortcuts /> */}
      </body>
    </html>
  )
}


