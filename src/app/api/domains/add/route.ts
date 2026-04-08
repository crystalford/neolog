export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addDomainToVercel, isValidDomain } from '@/lib/vercel/domains'

export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { domain, publicationId } = await request.json()

        // Validate input
        if (!domain || !publicationId) {
            return NextResponse.json(
                { error: 'Domain and publication ID are required' },
                { status: 400 }
            )
        }

        // Validate domain format
        if (!isValidDomain(domain)) {
            return NextResponse.json(
                { error: 'Invalid domain format. Use a valid domain like blog.example.com' },
                { status: 400 }
            )
        }

        // Check if user owns the publication
        const { data: publication } = await supabase
            .from('publications')
            .select('id, owner_id, custom_domain')
            .eq('id', publicationId)
            .single()

        if (!publication || publication.owner_id !== session.user.id) {
            return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
        }

        // Check if domain is already in use
        const { data: existingDomain } = await supabase
            .from('publications')
            .select('id, name')
            .eq('custom_domain', domain.toLowerCase())
            .maybeSingle()

        if (existingDomain) {
            return NextResponse.json(
                { error: 'This domain is already in use by another publication' },
                { status: 409 }
            )
        }

        // Add domain to Vercel
        try {
            await addDomainToVercel(domain.toLowerCase())
        } catch (error: any) {
            console.error('Vercel domain add error:', error)
            return NextResponse.json(
                { error: `Failed to add domain: ${error.message}` },
                { status: 500 }
            )
        }

        // Update database
        const { error: updateError } = await supabase
            .from('publications')
            .update({
                custom_domain: domain.toLowerCase(),
                domain_verified: false,
                domain_added_at: new Date().toISOString(),
            })
            .eq('id', publicationId)

        if (updateError) {
            console.error('Database update error:', updateError)
            return NextResponse.json(
                { error: 'Failed to save domain' },
                { status: 500 }
            )
        }

        // Log verification attempt
        await supabase
            .from('domain_verification_attempts')
            .insert({
                publication_id: publicationId,
                domain: domain.toLowerCase(),
                verification_method: 'dns',
                status: 'pending',
            })

        return NextResponse.json({
            success: true,
            domain: domain.toLowerCase(),
            dnsInstructions: {
                type: 'CNAME',
                name: domain.split('.')[0],
                value: 'cname.vercel-dns.com',
                ttl: 3600,
            },
        })
    } catch (error) {
        console.error('Add domain error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
