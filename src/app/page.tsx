/**
 * Root — the app opens directly into Timeline (per spec §4.5: "There is
 * no Home page"). Cloudflare Access gates the entire domain, so any
 * authenticated request hitting / lands in Timeline immediately.
 */
import { redirect } from 'next/navigation'
export const runtime = 'edge'

export default function Root() {
  redirect('/timeline')
}
