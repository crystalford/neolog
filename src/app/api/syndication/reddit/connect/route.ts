export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { getRedditAuthUrl } from '@/lib/syndication/reddit'

export const dynamic = 'force-dynamic'

/**
 * Initiate Reddit OAuth flow
 */
export async function GET(request: NextRequest) {
    try {
        // Generate random state for CSRF protection
        const state = Math.random().toString(36).substring(7)

        // Store state in cookie for verification
        const response = NextResponse.redirect(getRedditAuthUrl(state))
        response.cookies.set('reddit_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        })

        return response
    } catch (error: any) {
        console.error('Reddit OAuth init error:', error)
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=reddit_oauth_failed`
        )
    }
}
