export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Disconnect a platform
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { platform } = await request.json()

        if (!platform) {
            return NextResponse.json(
                { error: 'Platform is required' },
                { status: 400 }
            )
        }

        // Soft delete by setting is_active to false
        const { error } = await supabase
            .from('syndication_connections')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', session.user.id)
            .eq('platform', platform)

        if (error) {
            console.error('Database error:', error)
            return NextResponse.json(
                { error: 'Failed to disconnect platform' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Disconnect error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
