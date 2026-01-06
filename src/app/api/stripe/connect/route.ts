import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    finalMeta = { user_id: session.user.id, op: 'onboarding' }
    try {
      const run = await startJobRun('stripe.connect.onboarding', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, username, email:id')
      .eq('id', session.user.id)
      .single()

    let accountId = profile?.stripe_account_id

    // Create Connect account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: session.user.email,
        metadata: { supabase_user_id: session.user.id },
        capabilities: {
          transfers: { requested: true },
        },
      })
      accountId = account.id

      await supabase
        .from('profiles')
        .update({ stripe_account_id: accountId })
        .eq('id', session.user.id)
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/earnings?refresh=true`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/earnings?connected=true`,
      type: 'account_onboarding',
    })

    finalStatus = 'success'
    finalMeta = { ...finalMeta, stripe_account_id: accountId }
    return NextResponse.json({ url: accountLink.url })
  } catch (error) {
    console.error('Connect error:', error)
    finalErrorMessage = 'Failed to create account link'
    return NextResponse.json({ error: 'Failed to create account link' }, { status: 500 })
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

// Check account status
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    finalMeta = { user_id: session.user.id, op: 'status' }
    try {
      const run = await startJobRun('stripe.connect.status', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.stripe_account_id) {
      finalStatus = 'success'
      finalMeta = { ...finalMeta, connected: false }
      return NextResponse.json({ connected: false, enabled: false })
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id)
    const enabled = account.charges_enabled && account.payouts_enabled

    // Update profile if status changed
    await supabase
      .from('profiles')
      .update({ stripe_account_enabled: enabled })
      .eq('id', session.user.id)

    finalStatus = 'success'
    finalMeta = { ...finalMeta, connected: true, enabled }
    return NextResponse.json({ 
      connected: true, 
      enabled,
      details_submitted: account.details_submitted,
    })
  } catch (error) {
    console.error('Connect status error:', error)
    finalErrorMessage = 'Failed to check status'
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
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
