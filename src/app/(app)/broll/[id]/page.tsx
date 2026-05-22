import { redirect } from 'next/navigation'
export const runtime = 'edge'
export default function BrollRedirect({ params }: { params: { id: string } }) {
  // B-roll detail page was an orphan. The vlog detail page handles
  // both b-roll and full vlogs; redirect there.
  redirect(`/vlog/${params.id}`)
}
