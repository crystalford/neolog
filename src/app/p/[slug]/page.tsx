export const runtime = 'edge'
import { redirect } from 'next/navigation'

export default async function PublicationPublicPage({
  params,
}: {
  params: { slug: string }
}) {
  redirect(`/${params.slug}`)
}
