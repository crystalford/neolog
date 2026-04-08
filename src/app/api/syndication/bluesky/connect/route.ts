export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyBlueskyCredentials } from '@/lib/syndication/bluesky'

export const dynamic = 'force-dynamic'

/**
 * Connect Bluesky account
 * User provides their username and app password
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { identifier, password } = await request.json()

        if (!identifier || typeof identifier !== 'string') {
            return NextResponse.json(
                { error: 'Username/email is required' },
                { status: 400 }
            )
        }

        if (!password || typeof password !== 'string') {
            return NextResponse.json(
                { error: 'App password is required' },
                { status: 400 }
            )
        }

        // Verify credentials
        let blueskyUser
        try {
            blueskyUser = await verifyBlueskyCredentials(identifier, password)
        } catch (error: any) {
            return NextResponse.json(
                { error: 'Invalid Bluesky credentials' },
                { status: 400 }
            )
        }

        // Store connection in database
        // Store credentials as identifier|||password (TODO: Encrypt)
        const { error: upsertError } = await supabase
            .from('syndication_connections')
            .upsert({
                user_id: session.user.id,
                platform: 'bluesky',
                access_token: `${identifier}|||${password}`,
                platform_user_id: blueskyUser.did,
                platform_username: blueskyUser.handle,
                is_active: true,
                last_used_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,platform'
            })

        if (upsertError) {
            console.error('Database error:', upsertError)
            return NextResponse.json(
                { error: 'Failed to save connection' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            username: blueskyUser.handle,
            platform: 'bluesky',
        })
    } catch (error: any) {
        console.error('Bluesky connect error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
