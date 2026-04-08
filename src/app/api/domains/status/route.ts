export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDomainStatus } from '@/lib/vercel/domains'

export async function GET(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const publicationId = searchParams.get('publicationId')

        if (!publicationId) {
            return NextResponse.json(
                { error: 'Publication ID is required' },
                { status: 400 }
            )
        }

        // Get publication
        const { data: publication } = await supabase
            .from('publications')
            .select('id, owner_id, custom_domain, domain_verified')
            .eq('id', publicationId)
            .single()

        if (!publication || publication.owner_id !== session.user.id) {
            return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
        }

        if (!publication.custom_domain) {
            return NextResponse.json({
                configured: false,
                verified: false,
            })
        }

        // Get status from Vercel
        const status = await getDomainStatus(publication.custom_domain)

        return NextResponse.json({
            configured: true,
            domain: publication.custom_domain,
            verified: status.verified,
            sslEnabled: status.sslEnabled,
            error: status.error,
        })
    } catch (error) {
        console.error('Domain status error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
