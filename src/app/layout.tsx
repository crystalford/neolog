import type { Metadata } from 'next'
import './globals.css'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: 'Neolog',
  description: 'Personal life graph + creative production system.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
