export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Get the user's publication (one per user)
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get user's publication
        const { data: publication } = await supabase
            .from('publications')
            .select('id, name, slug, custom_domain, domain_verified')
            .eq('owner_id', session.user.id)
            .maybeSingle()

        if (!publication) {
            return NextResponse.json({ error: 'No publication found' }, { status: 404 })
        }

        return NextResponse.json({ publication })
    } catch (error) {
        console.error('Get publication error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
