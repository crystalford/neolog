'use client'

/**
 * The owner strip.
 *
 * `SPEC.md` §3: "When the operator is signed in and viewing a public page, a
 * thin strip under the masthead says *signed in · this is what a stranger
 * sees · your log →*. **Nothing is ever written on the public side**; the
 * strip is the way back. Strangers never see it."
 *
 * So it carries no controls. There is no edit, no publish, no bury on it —
 * the way back to where those live is the whole of what it offers, and that
 * restraint is the point: a public page that grows an edit button has
 * stopped being what a stranger sees.
 *
 * `signedIn` is passed by the page rather than detected here, because the
 * page already knows: it called an endpoint that requires the operator, and
 * a stranger gets nothing back. When one of these surfaces is eventually
 * served on a public path, that same flag becomes false for a stranger
 * without this component changing.
 */

import Link from 'next/link'

export default function OwnerStrip({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) return null
  return (
    <div className="ownerstrip">
      <span>signed in</span>
      <span>this is what a stranger sees</span>
      <Link href="/">your log →</Link>
    </div>
  )
}
