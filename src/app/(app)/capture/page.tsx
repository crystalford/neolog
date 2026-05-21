/**
 * /capture now redirects to /vlogs.
 *
 * The standalone Capture surface was merged into /vlogs in Phase 7.5 —
 * the operator browses videos AND uploads new ones from the same page.
 * Upload UI moved to <CapturePanel/> component, mounted inline at the
 * top of /vlogs via the "Drop new vlogs" toggle.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function CaptureRedirect() {
  redirect('/vlogs?capture=open')
}
