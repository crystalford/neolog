export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const { email, authorId } = await request.json()

        // Validate input
        if (!email || !email.includes('@')) {
            return NextResponse.json(
                { error: 'Valid email is required' },
                { status: 400 }
            )
        }

        if (!authorId) {
            return NextResponse.json(
                { error: 'Author ID is required' },
                { status: 400 }
            )
        }

        const supabase = createClient()

        // Check if already subscribed
        const { data: existing } = await supabase
            .from('newsletter_subscribers')
            .select('id, unsubscribed_at')
            .eq('email', email.toLowerCase())
            .eq('author_id', authorId)
            .maybeSingle()

        if (existing) {
            // If they previously unsubscribed, resubscribe them
            if (existing.unsubscribed_at) {
                const { error: updateError } = await supabase
                    .from('newsletter_subscribers')
                    .update({
                        unsubscribed_at: null,
                        subscribed_at: new Date().toISOString(),
                    })
                    .eq('id', existing.id)

                if (updateError) {
                    console.error('Newsletter resubscribe error:', updateError)
                    return NextResponse.json(
                        { error: 'Failed to resubscribe' },
                        { status: 500 }
                    )
                }

                return NextResponse.json({
                    success: true,
                    message: 'Successfully resubscribed!',
                })
            }

            // Already subscribed
            return NextResponse.json(
                { error: 'This email is already subscribed' },
                { status: 409 }
            )
        }

        // Create new subscription
        const { error: insertError } = await supabase
            .from('newsletter_subscribers')
            .insert({
                email: email.toLowerCase(),
                author_id: authorId,
            })

        if (insertError) {
            console.error('Newsletter subscribe error:', insertError)
            return NextResponse.json(
                { error: 'Failed to subscribe. Please try again.' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Successfully subscribed!',
        })
    } catch (error) {
        console.error('Newsletter API error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
