import { redirect } from 'next/navigation'
export const runtime = 'edge'
export default function HandleRedirect() {
  // Public profile pages dropped in Phase 7. Single-operator means /
  // already serves the public view (Timeline in unauthed mode).
  redirect('/')
}
