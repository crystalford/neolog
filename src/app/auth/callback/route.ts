import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirect = requestUrl.searchParams.get('redirect')

  if (code) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    if (session) {
      // Check if this is a new user (no display_name set)
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single()

      // New users go to onboarding
      if (!profile?.display_name) {
        return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
      }
    }
  }

  // Redirect to specified page or dashboard
  const redirectTo = redirect || '/dashboard'
  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
}
