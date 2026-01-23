import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeLinkedInCode, getLinkedInUser } from '@/lib/syndication/linkedin'

export const dynamic = 'force-dynamic'

/**
 * Handle LinkedIn OAuth callback
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const error = searchParams.get('error')

        // Check for OAuth errors
        if (error) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=linkedin_${error}`
            )
        }

        if (!code || !state) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=linkedin_invalid_callback`
            )
        }

        // Verify state (CSRF protection)
        const storedState = request.cookies.get('linkedin_oauth_state')?.value
        if (!storedState || storedState !== state) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=linkedin_invalid_state`
            )
        }

        // Exchange code for access token
        const { accessToken, expiresIn } = await exchangeLinkedInCode(code)

        // Get user info
        const linkedInUser = await getLinkedInUser(accessToken)

        // Get current user
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/login?error=session_expired`
            )
        }

        // Calculate expiration time
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

        // Store connection in database
        const { error: upsertError } = await supabase
            .from('syndication_connections')
            .upsert({
                user_id: session.user.id,
                platform: 'linkedin',
                access_token: accessToken, // TODO: Encrypt this
                token_expires_at: expiresAt,
                platform_user_id: linkedInUser.id,
                platform_username: linkedInUser.localizedFirstName + ' ' + linkedInUser.localizedLastName,
                is_active: true,
                last_used_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,platform'
            })

        if (upsertError) {
            console.error('Database error:', upsertError)
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=linkedin_save_failed`
            )
        }

        // Clear state cookie
        const response = NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?success=linkedin_connected`
        )
        response.cookies.delete('linkedin_oauth_state')

        return response
    } catch (error: any) {
        console.error('LinkedIn OAuth callback error:', error)
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=linkedin_callback_failed`
        )
    }
}
