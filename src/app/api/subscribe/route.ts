import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Subscribe via email (for non-logged-in users)
export async function POST(request: NextRequest) {
  try {
    const { email, creatorId, publicationId, source = 'website' } = await request.json()

    if (!email || !creatorId) {
      return NextResponse.json(
        { error: 'Email and creatorId are required' },
        { status: 400 }
      )
    }

    // Basic email validation
    if (!email.includes('@') || email.length < 5) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 }
      )
    }

    // Get creator info
    const { data: creator } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', creatorId)
      .single()

    if (!creator) {
      return NextResponse.json(
        { error: 'Creator not found' },
        { status: 404 }
      )
    }

    if (publicationId) {
      const { data: pub } = await admin
        .from('publications')
        .select('id')
        .eq('id', publicationId)
        .eq('owner_id', creatorId)
        .single()

      if (!pub) {
        return NextResponse.json(
          { error: 'Invalid publicationId for creator' },
          { status: 400 }
        )
      }
    }

    // Check if already subscribed
    const { data: existing } = await admin
      .from('email_subscribers')
      .select('id, status, confirmed')
      .eq('creator_id', creatorId)
      .eq('email', email.toLowerCase().trim())
      .eq('publication_id', publicationId ?? null)
      .single()

    if (existing) {
      if (existing.status === 'active' && existing.confirmed) {
        return NextResponse.json(
          { error: 'Already subscribed' },
          { status: 409 }
        )
      }
      // If pending, resend confirmation
      // Fall through to send email again
    }

    // Generate confirmation token
    const confirmationToken = crypto.randomUUID().replace(/-/g, '')

    // Insert or update subscriber
    const onConflict = publicationId
      ? 'creator_id,email,publication_id'
      : 'creator_id,email'

    const { data: subscriber, error: insertError } = await admin
      .from('email_subscribers')
      .upsert({
        creator_id: creatorId,
        publication_id: publicationId ?? null,
        email: email.toLowerCase().trim(),
        source,
        status: 'pending',
        confirmed: false,
        confirmation_token: confirmationToken,
      }, {
        onConflict,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create subscription' },
        { status: 500 }
      )
    }

    // Send confirmation email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const confirmUrl = `${baseUrl}/api/subscribe/confirm?token=${confirmationToken}`

    const resendKey = await resolveProviderKeyWithClient(admin as any, creatorId, 'resend')

    const emailResult = await sendEmail(
      email,
      'confirmation',
      {
        creatorName: creator.display_name || creator.username,
        creatorUsername: creator.username,
        confirmUrl,
      },
      resendKey ? { apiKey: resendKey.key } : undefined
    )

    if (!emailResult.success) {
      console.error('Email send failed:', emailResult.error)
      // Don't fail the request - subscription was created, email can be resent
    }

    return NextResponse.json({
      success: true,
      message: 'Confirmation email sent',
      needsConfirmation: true,
    })

  } catch (error) {
    console.error('Subscribe error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
