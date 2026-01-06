import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

// Subscribe via email (for non-logged-in users)
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const { email, creatorId, publicationId, source = 'website' } = await request.json()

    finalMeta = {
      creator_id: typeof creatorId === 'string' ? creatorId : null,
      publication_id: typeof publicationId === 'string' ? publicationId : null,
      source: typeof source === 'string' ? source : null,
      has_email: Boolean(email),
      email_len: typeof email === 'string' ? email.length : null,
    }
    try {
      const run = await startJobRun('subscribe.email.start', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!email || !creatorId) {
      finalErrorMessage = 'Email and creatorId are required'
      return NextResponse.json(
        { error: 'Email and creatorId are required' },
        { status: 400 }
      )
    }

    // Basic email validation
    if (!email.includes('@') || email.length < 5) {
      finalErrorMessage = 'Invalid email address'
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    const admin = createAdminClient()
    if (!admin) {
      finalErrorMessage = 'Server misconfigured'
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
      finalErrorMessage = 'Creator not found'
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
        finalErrorMessage = 'Invalid publicationId for creator'
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
        finalErrorMessage = 'Already subscribed'
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
      finalErrorMessage = 'Failed to create subscription'
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

    finalStatus = 'success'
    return NextResponse.json({
      success: true,
      message: 'Confirmation email sent',
      needsConfirmation: true,
    })

  } catch (error) {
    console.error('Subscribe error:', error)
    finalErrorMessage = 'Internal server error'
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
