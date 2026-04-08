export const runtime = 'edge'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const stripeSecret = process.env.STRIPE_SECRET_KEY
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!stripeSecret || !stripeWebhookSecret) {
    return NextResponse.json(
      { error: 'Missing Stripe configuration' },
      { status: 500 }
    )
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    )
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2023-10-16',
  })

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, stripeWebhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  finalMeta = { event_type: event.type, event_id: event.id }
  try {
    const run = await startJobRun('stripe.webhook', finalMeta)
    runId = run.id
  } catch {
    // best-effort
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        if (session.mode === 'subscription') {
          const { tier_id, subscriber_id, creator_id } = session.metadata!
          
          // Create paid subscription record
          await supabase.from('paid_subscriptions').upsert({
            subscriber_id,
            creator_id,
            tier_id,
            stripe_subscription_id: session.subscription as string,
            status: 'active',
            current_period_start: new Date().toISOString(),
          })

          // Also ensure free subscription exists
          await supabase.from('subscriptions').upsert({
            subscriber_id,
            creator_id,
          }, { onConflict: 'subscriber_id,creator_id' })
        }
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        
        await supabase
          .from('paid_subscriptions')
          .update({
            status: subscription.status === 'active' ? 'active' : 
                   subscription.status === 'canceled' ? 'canceled' : 
                   subscription.status === 'past_due' ? 'past_due' : 'canceled',
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        if (paymentIntent.metadata?.type === 'tip') {
          const { from_user_id, to_user_id, post_id, message, is_anonymous } = paymentIntent.metadata
          
          // Record tip
          await supabase.from('tips').insert({
            from_user_id: from_user_id === 'anonymous' ? null : from_user_id,
            to_user_id,
            post_id: post_id || null,
            amount_cents: paymentIntent.amount,
            stripe_payment_intent_id: paymentIntent.id,
            message: message || null,
            is_anonymous: is_anonymous === 'true',
          })

          // Record earnings
          const platformFee = Math.round(paymentIntent.amount * 0.1)
          await supabase.from('earnings').insert({
            user_id: to_user_id,
            source_type: 'tip',
            source_id: paymentIntent.id,
            gross_amount_cents: paymentIntent.amount,
            platform_fee_cents: platformFee,
            net_amount_cents: paymentIntent.amount - platformFee,
          })

          // Create notification
          if (from_user_id !== 'anonymous' && is_anonymous !== 'true') {
            await supabase.rpc('create_notification', {
              p_user_id: to_user_id,
              p_type: 'tip_received',
              p_actor_id: from_user_id,
              p_title: 'You received a tip!',
              p_body: `$${(paymentIntent.amount / 100).toFixed(2)}${message ? `: "${message}"` : ''}`,
            })
          }
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        
        if (invoice.subscription) {
          // Record subscription payment as earnings
          const { data: sub } = await supabase
            .from('paid_subscriptions')
            .select('creator_id')
            .eq('stripe_subscription_id', invoice.subscription)
            .single()

          if (sub) {
            const platformFee = Math.round(invoice.amount_paid * 0.1)
            await supabase.from('earnings').insert({
              user_id: sub.creator_id,
              source_type: 'subscription',
              source_id: invoice.id,
              gross_amount_cents: invoice.amount_paid,
              platform_fee_cents: platformFee,
              net_amount_cents: invoice.amount_paid - platformFee,
            })
          }
        }
        break
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const enabled = account.charges_enabled && account.payouts_enabled
        
        await supabase
          .from('profiles')
          .update({ stripe_account_enabled: enabled })
          .eq('stripe_account_id', account.id)
        break
      }
    }

    finalStatus = 'success'
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    finalErrorMessage = 'Webhook handler failed'
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
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
