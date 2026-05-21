/**
 * App layout — wraps every authed surface.
 *
 * The Console-direction design (HANDOFF.md) replaces the old mobile-first
 * Crown + Dock + FAB chrome with a desktop Topbar + Sidebar + main + optional
 * right rail. Every page renders its own `<Shell active="..." breadcrumb={...}>`
 * so the layout here is intentionally thin — it just provides the
 * authentication boundary + the html structure + the global CMD-K
 * palette overlay (mounted once so every page gets the shortcut).
 */

import { CmdK } from '@/components/CmdK'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CmdK/>
    </>
  )
}
