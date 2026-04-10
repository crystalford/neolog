import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('CRITICAL: Supabase environment variables are missing.')
    // In Edge Runtime, throwing here crashes the entire layout. 
    // We return a dummy client or handle it in the component.
  }

  return createBrowserClient(
    url || '',
    key || ''
  )
}
