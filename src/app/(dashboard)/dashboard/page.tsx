import { redirect } from 'next/navigation'

// The Daily Log is now the primary dashboard home
export default function DashboardIndexPage() {
  redirect('/dashboard/log')
}
