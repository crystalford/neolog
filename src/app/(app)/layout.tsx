/**
 * App layout — wraps every authed surface (Timeline, Studio, Graph, Projects,
 * Settings, Capture, detail pages) with the shared chrome:
 *   • Crown (logo + meta) at top
 *   • Capture FAB above the dock
 *   • Dock (5 entries) fixed at bottom
 *
 * The phone-frame styling from the prototype is rendered responsively here —
 * on phone widths the column fills the viewport, on desktop it centers a
 * 560px-wide column over the dusk-warm background.
 */

import { Crown } from '@/components/Crown'
import { Dock } from '@/components/Dock'
import { CaptureFab } from '@/components/CaptureFab'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Crown />
      {children}
      <CaptureFab />
      <Dock />
    </div>
  )
}
