import type { Metadata, Viewport } from 'next'
import './globals.css'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: 'neolog',
  description: 'A permanent personal log.',
  manifest: '/manifest.webmanifest',
  // Installed to a phone's home screen it opens at /now — the intake with
  // nothing else on the screen. The operator's own requirement was that
  // capture be as cheap as it is: "it almost has to be an app because it has
  // to just be very easy for me to capture this stuff."
  appleWebApp: { capable: true, title: 'neolog', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
