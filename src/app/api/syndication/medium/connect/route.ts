import { NextRequest, NextResponse } from 'next/server'
import { getMediumAuthUrl } from '@/lib/syndication/medium'

/**
 * Initiate Medium OAuth flow
 */
export async function GET(request: NextRequest) {
    try {
        // Generate random state for CSRF protection
        const state = Math.random().toString(36).substring(7)

        // Store state in cookie for verification
        const response = NextResponse.redirect(getMediumAuthUrl(state))
        response.cookies.set('medium_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        })

        return response
    } catch (error: any) {
        console.error('Medium OAuth init error:', error)
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?error=medium_oauth_failed`
        )
    }
}
