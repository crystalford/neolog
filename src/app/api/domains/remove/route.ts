import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { removeDomainFromVercel } from '@/lib/vercel/domains'

export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { publicationId } = await request.json()

        if (!publicationId) {
            return NextResponse.json(
                { error: 'Publication ID is required' },
                { status: 400 }
            )
        }

        // Get publication
        const { data: publication } = await supabase
            .from('publications')
            .select('id, owner_id, custom_domain')
            .eq('id', publicationId)
            .single()

        if (!publication || publication.owner_id !== session.user.id) {
            return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
        }

        if (!publication.custom_domain) {
            return NextResponse.json(
                { error: 'No custom domain to remove' },
                { status: 400 }
            )
        }

        const domainToRemove = publication.custom_domain

        // Remove from Vercel
        try {
            await removeDomainFromVercel(domainToRemove)
        } catch (error: any) {
            console.error('Vercel domain remove error:', error)
            // Continue anyway to clean up database
        }

        // Update database
        const { error: updateError } = await supabase
            .from('publications')
            .update({
                custom_domain: null,
                domain_verified: false,
                domain_verification_token: null,
                domain_added_at: null,
                domain_verified_at: null,
            })
            .eq('id', publicationId)

        if (updateError) {
            console.error('Database update error:', updateError)
            return NextResponse.json(
                { error: 'Failed to remove domain' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Domain removed successfully',
        })
    } catch (error) {
        console.error('Remove domain error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
