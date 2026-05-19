/**
 * /timeline → / redirect.
 *
 * The Timeline is now the home surface (X-style feed). The old /timeline
 * URL stays alive so existing bookmarks resolve to the new location.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function TimelineRedirect() {
  redirect('/')
}
