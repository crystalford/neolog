// REDIRECT: Inbox has been merged into Captures view
import { redirect } from 'next/navigation'

export default function InboxPage() {
  redirect('/dashboard/captures?tab=inbox')
}
