import { redirect } from 'next/navigation'
export const runtime = 'edge'
export default function ClipRedirect({ params }: { params: { id: string } }) {
  // Clips were folded into threads in Phase 7. /clip/[id] → /thread/[id].
  redirect(`/thread/${params.id}`)
}
