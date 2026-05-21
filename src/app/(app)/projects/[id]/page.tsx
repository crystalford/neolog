/**
 * /projects/[id] now redirects to /productions/[id].
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function ProjectDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/productions/${params.id}`)
}
