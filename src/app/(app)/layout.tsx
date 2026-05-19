/**
 * App layout — wraps every authed surface.
 *
 * The Console-direction design (HANDOFF.md) replaces the old mobile-first
 * Crown + Dock + FAB chrome with a desktop Topbar + Sidebar + main + optional
 * right rail. Every page renders its own `<Shell active="..." breadcrumb={...}>`
 * so the layout here is intentionally thin — it just provides the
 * authentication boundary + the html structure.
 *
 * Legacy pages that still wrap themselves in `<main>` directly will render
 * un-chromed; we port them one by one.
 */

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
