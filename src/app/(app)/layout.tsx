/**
 * App layout — wraps every authed surface.
 *
 * Intentionally thin. Each page renders its own <Shell/>, which
 * provides the masthead + main column. No global overlays at this
 * level after the ⌘K palette was removed.
 */

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
