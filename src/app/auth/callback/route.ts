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
      // Users must finish onboarding (username selection etc.)
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarded_at')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error && (error as any).message?.includes('onboarded_at')) {
        // Backward-compatible fallback if the column isn't present yet.
        const { data: legacyProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .maybeSingle()

        if (!legacyProfile?.display_name) {
          return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
        }
      } else {
        if (!profile?.onboarded_at) {
          return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
        }
      }
    }
  }

  // Redirect to specified page or dashboard
  const redirectTo = redirect || '/dashboard'
  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
}
