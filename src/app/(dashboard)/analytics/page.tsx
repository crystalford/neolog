// REDIRECT: Analytics has been merged into Published view
import { redirect } from 'next/navigation'

export default function AnalyticsPage() {
  redirect('/dashboard/published?tab=analytics')
}
