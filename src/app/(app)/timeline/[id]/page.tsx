/**
 * /timeline/[id] now redirects to /vlog/[id].
 *
 * Vlog detail moved to /vlog/[id] in Phase 5 to match canon naming.
 * Data + workflow + LivePipeline unchanged.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function VlogDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/vlog/${params.id}`)
}
