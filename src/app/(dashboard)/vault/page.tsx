// REDIRECT: Vault has been merged into Captures view
import { redirect } from 'next/navigation'

export default function VaultPage() {
  redirect('/dashboard/captures?tab=vault')
}
