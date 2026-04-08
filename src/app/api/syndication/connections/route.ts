export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Get user's syndication connections
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: connections, error } = await supabase
            .from('syndication_connections')
            .select('platform, platform_username, is_active, created_at, last_used_at')
            .eq('user_id', session.user.id)
            .eq('is_active', true)

        if (error) {
            console.error('Database error:', error)
            return NextResponse.json(
                { error: 'Failed to fetch connections' },
                { status: 500 }
            )
        }

        return NextResponse.json({ connections: connections || [] })
    } catch (error) {
        console.error('Get connections error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
