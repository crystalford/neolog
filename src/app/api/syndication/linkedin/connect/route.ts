export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { getLinkedInAuthUrl } from '@/lib/syndication/linkedin'

export const dynamic = 'force-dynamic'

/**
 * Initiate LinkedIn OAuth flow
 */
export async function GET(request: NextRequest) {
    try {
        // Generate random state for CSRF protection
        const state = Math.random().toString(36).substring(7)

        // Store state in cookie for verification
        const response = NextResponse.redirect(getLinkedInAuthUrl(state))
        response.cookies.set('linkedin_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        })

        return response
    } catch (error: any) {
        console.error('LinkedIn OAuth init error:', error)
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/distribution?error=linkedin_oauth_failed`
        )
    }
}
