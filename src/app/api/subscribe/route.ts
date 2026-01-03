import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'

// Subscribe via email (for non-logged-in users)
export async function POST(request: NextRequest) {
  try {
    const { email, creatorId, source = 'website' } = await request.json()

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

    // Check if already subscribed
    const { data: existing } = await supabase
      .from('email_subscribers')
      .select('id, status, confirmed')
      .eq('creator_id', creatorId)
      .eq('email', email.toLowerCase().trim())
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
    const { data: subscriber, error: insertError } = await supabase
      .from('email_subscribers')
      .upsert({
        creator_id: creatorId,
        email: email.toLowerCase().trim(),
        source,
        status: 'pending',
        confirmed: false,
        confirmation_token: confirmationToken,
      }, {
        onConflict: 'creator_id,email',
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

    const emailResult = await sendEmail(email, 'confirmation', {
      creatorName: creator.display_name || creator.username,
      creatorUsername: creator.username,
      confirmUrl,
    })

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
