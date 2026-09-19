/**
 * Server wrapper for a month page.
 *
 * Next 15 makes a page's `params` a Promise, and React 18.3 (pinned in this
 * repo) has no `use()` hook to unwrap one inside a Client Component. So the
 * async unwrap happens here, in a thin Server Component, and the resolved
 * `ym` is passed down as a plain prop to the Client Component that does the
 * actual work.
 */

import { MonthPageClient } from './MonthPageClient'

export default async function MonthPage({ params }: { params: Promise<{ ym: string }> }) {
  const { ym } = await params
  return <MonthPageClient ym={ym} />
}
