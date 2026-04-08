export const runtime = 'edge'
import { redirect } from 'next/navigation'

// Quick Ingest was merged into the Log page
export default function IngestRedirect() {
  redirect('/dashboard/log')
}
