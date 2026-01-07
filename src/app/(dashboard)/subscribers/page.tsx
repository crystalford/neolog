// REDIRECT: Subscribers has been merged into Published > Engagement
import { redirect } from 'next/navigation'

export default function SubscribersPage() {
  redirect('/dashboard/published?tab=engagement')
}
