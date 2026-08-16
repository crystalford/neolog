/**
 * /clips now redirects to /drafts?tab=clips.
 *
 * Subjects, Topics, and Clips consolidated into one tabbed page — see
 * src/app/(app)/drafts/page.tsx. This redirect keeps old bookmarks and
 * deep links working; the list logic itself lives in
 * src/components/drafts/ClipsList.tsx.
 *
 * Note: /clips/[id]/edit (the clip trim/extend editor) is a detail page,
 * untouched by this consolidation — it keeps its own route.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function ClipsRedirect() {
  redirect('/drafts?tab=clips')
}
