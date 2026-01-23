import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeRedditCode, getRedditUser } from '@/lib/syndication/reddit'

export const dynamic = 'force-dynamic'

/**
 * Handle Reddit OAuth callback
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const error = searchParams.get('error')

        if (error) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=reddit_${error}`
            )
        }

        if (!code || !state) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=reddit_invalid_callback`
            )
        }

        // Verify state
        const storedState = request.cookies.get('reddit_oauth_state')?.value
        if (!storedState || storedState !== state) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=reddit_invalid_state`
            )
        }

        // Exchange code for token
        const { accessToken, refreshToken, expiresIn } = await exchangeRedditCode(code)

        // Get user info
        const redditUser = await getRedditUser(accessToken)

        // Get current user
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/login?error=session_expired`
            )
        }

        // Calculate expiration
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

        // Store connection
        const { error: upsertError } = await supabase
            .from('syndication_connections')
            .upsert({
                user_id: session.user.id,
                platform: 'reddit',
                access_token: `${accessToken}|||${refreshToken}`, // Store both tokens
                token_expires_at: expiresAt,
                platform_user_id: redditUser.id,
                platform_username: redditUser.name,
                is_active: true,
                last_used_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,platform'
            })

        if (upsertError) {
            console.error('Database error:', upsertError)
            return NextResponse.redirect(
                `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=reddit_save_failed`
            )
        }

        // Clear state cookie
        const response = NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?success=reddit_connected`
        )
        response.cookies.delete('reddit_oauth_state')

        return response
    } catch (error: any) {
        console.error('Reddit OAuth callback error:', error)
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=reddit_callback_failed`
        )
    }
}
