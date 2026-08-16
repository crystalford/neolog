/**
 * /subjects now redirects to /drafts?tab=subjects.
 *
 * Subjects, Topics, and Clips consolidated into one tabbed page — see
 * src/app/(app)/drafts/page.tsx. This redirect keeps old bookmarks and
 * deep links working; the list logic itself lives in
 * src/components/drafts/SubjectsList.tsx.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function SubjectsRedirect() {
  redirect('/drafts?tab=subjects')
}
