/**
 * App layout — wraps every authed surface with responsive chrome.
 *
 * Mobile (≤1023px): Crown (logo + meta) at top, content below, floating
 * CaptureFab above bottom Dock.
 * Desktop (≥1024px): Sidebar on left with nav + capture actions, wide
 * content area to the right. Crown / dock / FAB are hidden via media query.
 */

import { Crown } from '@/components/Crown'
import { Dock } from '@/components/Dock'
import { CaptureFab } from '@/components/CaptureFab'
import { Sidebar } from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <Crown />
      {children}
      <CaptureFab />
      <Dock />
    </div>
  )
}
