import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

// Confirm email subscription
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const token = request.nextUrl.searchParams.get('token')
  
  if (!token) {
    return NextResponse.redirect(new URL('/?error=invalid_token', request.url))
  }

  finalMeta = { token_len: token.length }
  try {
    const run = await startJobRun('subscribe.email.confirm', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const supabase = createClient()
    const admin = createAdminClient()
    if (!admin) {
      finalErrorMessage = 'server_misconfigured'
      return NextResponse.redirect(new URL('/?error=server_misconfigured', request.url))
    }

    // Find subscriber with this token
    const { data: subscriber, error: findError } = await admin
      .from('email_subscribers')
      .select('id, creator_id, confirmed, confirmation_token')
      .eq('confirmation_token', token)
      .single()

    if (findError || !subscriber) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'invalid_token' }
      return NextResponse.redirect(new URL('/?error=invalid_token', request.url))
    }

    const { data: creator } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', subscriber.creator_id)
      .single()

    // Already confirmed?
    if (subscriber.confirmed) {
      const creatorUsername = creator?.username || ''
      finalStatus = 'success'
      finalMeta = { ...finalMeta, result: 'already_confirmed', creator_id: subscriber.creator_id }
      return NextResponse.redirect(new URL(`/${creatorUsername}?confirmed=already`, request.url))
    }

    // Confirm the subscription
    const { error: updateError } = await admin
      .from('email_subscribers')
      .update({
        status: 'active',
        confirmed: true,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', subscriber.id)

    if (updateError) {
      finalErrorMessage = 'confirmation_failed'
      return NextResponse.redirect(new URL('/?error=confirmation_failed', request.url))
    }

    // Redirect to creator's profile with success message
    const creatorUsername = creator?.username || ''
    finalStatus = 'success'
    finalMeta = { ...finalMeta, result: 'success', creator_id: subscriber.creator_id }
    return NextResponse.redirect(new URL(`/${creatorUsername}?confirmed=success`, request.url))
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Unhandled error'
    return NextResponse.redirect(new URL('/?error=confirmation_failed', request.url))
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

// Unsubscribe
export async function DELETE(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const token = request.nextUrl.searchParams.get('token')
  
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  finalMeta = { token_len: token.length }
  try {
    const run = await startJobRun('subscribe.email.unsubscribe', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    const admin = createAdminClient()
    if (!admin) {
      finalErrorMessage = 'server_misconfigured'
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // Find and unsubscribe
    const { error } = await admin
      .from('email_subscribers')
      .update({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
      })
      .eq('unsubscribe_token', token)

    if (error) {
      finalErrorMessage = 'unsubscribe_failed'
      return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 })
    }

    finalStatus = 'success'
    return NextResponse.json({ success: true })
  } catch (e: any) {
    finalErrorMessage = e?.message || 'Unhandled error'
    return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 })
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
