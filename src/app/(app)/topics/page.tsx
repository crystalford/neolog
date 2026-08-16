/**
 * /topics now redirects to /drafts?tab=topics.
 *
 * Subjects, Topics, and Clips consolidated into one tabbed page — see
 * src/app/(app)/drafts/page.tsx. This redirect keeps old bookmarks, the
 * "quick video" home card's ?quick= param, and deep links working; the
 * list logic itself lives in src/components/drafts/TopicsList.tsx.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function TopicsRedirect({
  searchParams,
}: {
  searchParams: { quick?: string }
}) {
  const quick = searchParams?.quick
  redirect(`/drafts?tab=topics${quick ? `&quick=${encodeURIComponent(quick)}` : ''}`)
}
