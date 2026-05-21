/**
 * /threads now redirects to /?filter=thread.
 *
 * Operator's call: "shouldn't thread and timeline merge? And you
 * can just filter by threads on the timeline?" Right — the Timeline
 * already has a Threads filter pill. A standalone /threads page
 * duplicated the data with a slightly different rendering. Merged.
 *
 * The redirect preserves any old bookmarks pointing at /threads.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function ThreadsRedirect() {
  redirect('/?filter=thread')
}
