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

    const { tierId, creatorId } = await request.json().catch(() => ({}))

    finalMeta = {
      user_id: session.user.id,
      tier_id: typeof tierId === 'string' ? tierId : null,
      creator_id: typeof creatorId === 'string' ? creatorId : null,
    }
    try {
      const run = await startJobRun('stripe.checkout.create', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    // Get tier details
    const { data: tier } = await supabase
      .from('subscription_tiers')
      .select('*, creator:profiles(username, display_name, stripe_account_id)')
      .eq('id', tierId)
      .single()

    if (!tier || !tier.stripe_price_id) {
      finalErrorMessage = 'Tier not found'
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 })
    }

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email:id')
      .eq('id', session.user.id)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: { supabase_user_id: session.user.id },
      })
      customerId = customer.id

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', session.user.id)
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/${tier.creator.username}?subscribed=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/${tier.creator.username}`,
      metadata: {
        tier_id: tierId,
        subscriber_id: session.user.id,
        creator_id: creatorId,
      },
      subscription_data: {
        application_fee_percent: 10, // 10% platform fee
        transfer_data: tier.creator.stripe_account_id ? {
          destination: tier.creator.stripe_account_id,
        } : undefined,
      },
    })

    finalStatus = 'success'
    finalMeta = { ...finalMeta, stripe_checkout_session_id: checkoutSession.id }
    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Checkout error:', error)
    finalErrorMessage = 'Failed to create checkout'
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
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
