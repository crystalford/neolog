/**
 * /cluster/[id] now redirects to /studio/[id].
 *
 * Studio is the canon name per Phase 4. Cluster data + workflow
 * unchanged — just the route renamed.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function ClusterDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/studio/${params.id}`)
}
