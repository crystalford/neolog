import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeMediumCode, getMediumUser } from '@/lib/syndication/medium'

/**
 * Handle Medium OAuth callback
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
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?error=medium_${error}`
            )
        }

        if (!code || !state) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?error=medium_invalid_callback`
            )
        }

        // Verify state (CSRF protection)
        const storedState = request.cookies.get('medium_oauth_state')?.value
        if (!storedState || storedState !== state) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?error=medium_invalid_state`
            )
        }

        // Exchange code for access token
        const { accessToken, refreshToken, expiresAt } = await exchangeMediumCode(code)

        // Get user info
        const mediumUser = await getMediumUser(accessToken)

        // Get current user
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/login?error=session_expired`
            )
        }

        // Store connection in database
        const { error: upsertError } = await supabase
            .from('syndication_connections')
            .upsert({
                user_id: session.user.id,
                platform: 'medium',
                access_token: accessToken, // TODO: Encrypt this
                refresh_token: refreshToken,
                token_expires_at: expiresAt,
                platform_user_id: mediumUser.id,
                platform_username: mediumUser.username,
                is_active: true,
                last_used_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,platform'
            })

        if (upsertError) {
            console.error('Database error:', upsertError)
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?error=medium_save_failed`
            )
        }

        // Clear state cookie
        const response = NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?success=medium_connected`
        )
        response.cookies.delete('medium_oauth_state')

        return response
    } catch (error: any) {
        console.error('Medium OAuth callback error:', error)
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?error=medium_callback_failed`
        )
    }
}
