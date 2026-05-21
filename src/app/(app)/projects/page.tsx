/**
 * /projects now redirects to /productions.
 *
 * Productions is the canon-aligned surface name per Phase 7. Table is
 * still `projects` in D1; only the UI label changed.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function ProjectsRedirect() {
  redirect('/productions')
}
