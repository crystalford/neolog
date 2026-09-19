/**
 * Server wrapper for a page's detail view.
 *
 * Next 15 makes a page's `params` a Promise, and React 18.3 (pinned in this
 * repo) has no `use()` hook to unwrap one inside a Client Component. So the
 * async unwrap happens here, in a thin Server Component, and the resolved
 * `id` is passed down as a plain prop to the Client Component that does the
 * actual work.
 */

import { PageViewClient } from './PageViewClient'

export default async function PageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PageViewClient id={id} />
}
