import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDomainStatus } from '@/lib/vercel/domains'

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
                { error: 'No custom domain configured' },
                { status: 400 }
            )
        }

        // Check domain status with Vercel
        const status = await getDomainStatus(publication.custom_domain)

        if (status.verified) {
            // Update database
            const { error: updateError } = await supabase
                .from('publications')
                .update({
                    domain_verified: true,
                    domain_verified_at: new Date().toISOString(),
                })
                .eq('id', publicationId)

            if (updateError) {
                console.error('Database update error:', updateError)
            }

            // Log successful verification
            await supabase
                .from('domain_verification_attempts')
                .insert({
                    publication_id: publicationId,
                    domain: publication.custom_domain,
                    verification_method: 'dns',
                    status: 'verified',
                    verified_at: new Date().toISOString(),
                })

            return NextResponse.json({
                success: true,
                verified: true,
                message: 'Domain verified successfully!',
            })
        }

        // Log failed verification
        await supabase
            .from('domain_verification_attempts')
            .insert({
                publication_id: publicationId,
                domain: publication.custom_domain,
                verification_method: 'dns',
                status: 'failed',
                error_message: status.error || 'DNS not configured correctly',
            })

        return NextResponse.json({
            success: false,
            verified: false,
            message: status.error || 'DNS not configured correctly. Please check your DNS settings.',
        })
    } catch (error) {
        console.error('Verify domain error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
