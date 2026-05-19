/**
 * /timeline → /vlogs redirect.
 *
 * The Console-direction design folded the heterogeneous "Timeline" feed
 * into two new surfaces: the Vlogs grid at /vlogs and the activity stream
 * on the Console home at /. This redirect preserves any old bookmarks /
 * deep links so they land on /vlogs (the closer match — same source list,
 * new chrome). Surfaced cards / threads / posts that used to share the
 * timeline feed now live on their own respective list pages.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function TimelineRedirect() {
  redirect('/vlogs')
}
