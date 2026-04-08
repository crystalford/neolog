export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDevToUser } from '@/lib/syndication/devto'

/**
 * Connect Dev.to account
 * User provides their Dev.to API key
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { apiKey } = await request.json()

        if (!apiKey || typeof apiKey !== 'string') {
            return NextResponse.json(
                { error: 'API key is required' },
                { status: 400 }
            )
        }

        // Verify API key by fetching user info
        let devToUser
        try {
            devToUser = await getDevToUser(apiKey)
        } catch (error: any) {
            return NextResponse.json(
                { error: 'Invalid Dev.to API key' },
                { status: 400 }
            )
        }

        // Store connection in database
        const { error: upsertError } = await supabase
            .from('syndication_connections')
            .upsert({
                user_id: session.user.id,
                platform: 'devto',
                access_token: apiKey, // TODO: Encrypt this
                platform_user_id: devToUser.id.toString(),
                platform_username: devToUser.username,
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
            username: devToUser.username,
            platform: 'devto',
        })
    } catch (error) {
        console.error('Dev.to connect error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
