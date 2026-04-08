export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHashnodeUser } from '@/lib/syndication/hashnode'

/**
 * Connect Hashnode account
 * User provides their Hashnode API key and publication ID
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { apiKey, publicationId } = await request.json()

        if (!apiKey || typeof apiKey !== 'string') {
            return NextResponse.json(
                { error: 'API key is required' },
                { status: 400 }
            )
        }

        if (!publicationId || typeof publicationId !== 'string') {
            return NextResponse.json(
                { error: 'Publication ID is required' },
                { status: 400 }
            )
        }

        // Verify API key by fetching user info
        let hashnodeUser
        try {
            hashnodeUser = await getHashnodeUser(apiKey)
        } catch (error: any) {
            return NextResponse.json(
                { error: 'Invalid Hashnode API key' },
                { status: 400 }
            )
        }

        // Verify publication ID belongs to user
        const userPublications = hashnodeUser.publications?.edges || []
        const hasPublication = userPublications.some(
            (edge: any) => edge.node.id === publicationId
        )

        if (!hasPublication) {
            return NextResponse.json(
                { error: 'Publication ID not found in your account' },
                { status: 400 }
            )
        }

        // Store connection in database (store both API key and publication ID)
        const { error: upsertError } = await supabase
            .from('syndication_connections')
            .upsert({
                user_id: session.user.id,
                platform: 'hashnode',
                access_token: `${apiKey}|||${publicationId}`, // Store both (TODO: Encrypt)
                platform_user_id: hashnodeUser.id,
                platform_username: hashnodeUser.username,
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
            username: hashnodeUser.username,
            platform: 'hashnode',
        })
    } catch (error) {
        console.error('Hashnode connect error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
